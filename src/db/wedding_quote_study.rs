// @locs-version: 1.0
use super::Db;
use serde::Serialize;
use serde_json::Value;
use sqlx::Row;

#[derive(Clone, Debug, Serialize)]
pub struct WeddingQuoteStudyRecord {
    pub submission_id: String,
    pub public_receipt_id: String,
    pub source_mode: String,
    pub quote_category: String,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub content_sha256: String,
    #[serde(skip_serializing)]
    pub storage_backend: Option<String>,
    #[serde(skip_serializing)]
    pub storage_key: Option<String>,
    pub consent_version: String,
    pub consented_at: String,
    pub analysis_status: String,
    pub analysis_result: Option<Value>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub tokens_input: Option<i32>,
    pub tokens_output: Option<i32>,
    pub failure_code: Option<String>,
    pub created_at: String,
    pub analysed_at: Option<String>,
}

fn record(row: sqlx::postgres::PgRow) -> WeddingQuoteStudyRecord {
    WeddingQuoteStudyRecord {
        submission_id: row.get("submission_id"),
        public_receipt_id: row.get("public_receipt_id"),
        source_mode: row.get("source_mode"),
        quote_category: row.get("quote_category"),
        file_name: row.get("file_name"),
        mime_type: row.get("mime_type"),
        size_bytes: row.get("size_bytes"),
        content_sha256: row.get("content_sha256"),
        storage_backend: row.get("storage_backend"),
        storage_key: row.get("storage_key"),
        consent_version: row.get("consent_version"),
        consented_at: row.get("consented_at"),
        analysis_status: row.get("analysis_status"),
        analysis_result: row.get("analysis_result"),
        provider: row.get("provider"),
        model: row.get("model"),
        tokens_input: row.get("tokens_input"),
        tokens_output: row.get("tokens_output"),
        failure_code: row.get("failure_code"),
        created_at: row.get("created_at"),
        analysed_at: row.get("analysed_at"),
    }
}

const RETURNING: &str = r#"submission_id, public_receipt_id, source_mode,
    quote_category, file_name, mime_type, size_bytes, content_sha256,
    storage_backend, storage_key, consent_version, consented_at::text AS consented_at,
    analysis_status, analysis_result, provider, model, tokens_input, tokens_output,
    failure_code, created_at::text AS created_at, analysed_at::text AS analysed_at"#;

impl Db {
    #[allow(clippy::too_many_arguments)]
    pub async fn create_wedding_quote_study_submission(
        &self,
        submission_id: &str,
        public_receipt_id: &str,
        delete_token_hash: &str,
        source_mode: &str,
        quote_category: &str,
        file_name: &str,
        mime_type: &str,
        size_bytes: i64,
        content_sha256: &str,
        storage_key: &str,
        consent_version: &str,
        consent_notice_sha256: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO wedding_quote_study_submissions (
                 submission_id, public_receipt_id, delete_token_hash, source_mode,
                 quote_category, file_name, mime_type, size_bytes, content_sha256,
                 storage_backend, storage_key, consent_version, consent_notice_sha256,
                 study_consent, admin_access_allowed, uploader_authority_confirmed,
                 consented_at, analysis_status
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'seaweedfs',$10,$11,$12,
                 TRUE,TRUE,TRUE,NOW(),'processing')"#,
        )
        .bind(submission_id)
        .bind(public_receipt_id)
        .bind(delete_token_hash)
        .bind(source_mode)
        .bind(quote_category)
        .bind(file_name)
        .bind(mime_type)
        .bind(size_bytes)
        .bind(content_sha256)
        .bind(storage_key)
        .bind(consent_version)
        .bind(consent_notice_sha256)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn complete_wedding_quote_study_submission(
        &self,
        submission_id: &str,
        analysis: &Value,
        provider_request_id: Option<&str>,
        tokens_input: i32,
        tokens_output: i32,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"UPDATE wedding_quote_study_submissions SET
                 analysis_status='completed', analysis_result=$2, provider='openrouter',
                 model='openai/gpt-5-mini', provider_request_id=$3,
                 tokens_input=$4, tokens_output=$5, failure_code=NULL, analysed_at=NOW()
               WHERE submission_id=$1 AND analysis_status='processing'"#,
        )
        .bind(submission_id)
        .bind(analysis)
        .bind(provider_request_id)
        .bind(tokens_input)
        .bind(tokens_output)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn fail_wedding_quote_study_submission(
        &self,
        submission_id: &str,
        failure_code: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE wedding_quote_study_submissions SET analysis_status='failed', failure_code=$2, analysed_at=NOW() WHERE submission_id=$1 AND analysis_status='processing'",
        )
        .bind(submission_id)
        .bind(failure_code)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_wedding_quote_study_submissions(
        &self,
        limit: i64,
    ) -> Result<Vec<WeddingQuoteStudyRecord>, sqlx::Error> {
        let sql = format!(
            "SELECT {RETURNING} FROM wedding_quote_study_submissions WHERE analysis_status <> 'deleted' ORDER BY created_at DESC LIMIT $1"
        );
        let rows = sqlx::query(&sql)
            .bind(limit.clamp(1, 200))
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(record).collect())
    }

    pub async fn get_wedding_quote_study_submission(
        &self,
        submission_id: &str,
    ) -> Result<Option<WeddingQuoteStudyRecord>, sqlx::Error> {
        let sql = format!(
            "SELECT {RETURNING} FROM wedding_quote_study_submissions WHERE submission_id=$1 AND analysis_status <> 'deleted'"
        );
        let row = sqlx::query(&sql)
            .bind(submission_id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(record))
    }

    pub async fn authorize_wedding_quote_study_deletion(
        &self,
        public_receipt_id: &str,
        delete_token_hash: &str,
    ) -> Result<Option<WeddingQuoteStudyRecord>, sqlx::Error> {
        let sql = format!(
            "SELECT {RETURNING} FROM wedding_quote_study_submissions WHERE public_receipt_id=$1 AND delete_token_hash=$2 AND analysis_status <> 'deleted'"
        );
        let row = sqlx::query(&sql)
            .bind(public_receipt_id)
            .bind(delete_token_hash)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(record))
    }

    pub async fn mark_wedding_quote_study_deleted(
        &self,
        submission_id: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"UPDATE wedding_quote_study_submissions SET analysis_status='deleted',
                 storage_backend=NULL, storage_key=NULL, analysis_result=NULL,
                 provider_request_id=NULL, failure_code=NULL, file_name='deleted',
                 mime_type='application/octet-stream', size_bytes=1,
                 content_sha256=repeat('0', 64), deleted_at=NOW()
               WHERE submission_id=$1"#,
        )
        .bind(submission_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
