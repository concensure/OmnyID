import test from "node:test";
import assert from "node:assert/strict";

const localStorageState = new Map<string, string>();
const sessionStorageState = new Map<string, string>();

const windowStub = {
  location: {
    origin: "http://localhost:4173",
    hostname: "localhost",
  },
  localStorage: {
    getItem(key: string) {
      return localStorageState.has(key) ? localStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageState.set(key, value);
    },
    removeItem(key: string) {
      localStorageState.delete(key);
    },
  },
  sessionStorage: {
    getItem(key: string) {
      return sessionStorageState.has(key) ? sessionStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      sessionStorageState.set(key, value);
    },
    removeItem(key: string) {
      sessionStorageState.delete(key);
    },
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
};

Object.defineProperty(globalThis, "window", {
  value: windowStub,
  configurable: true,
  writable: true,
});

test("fetchFileLibrary forwards category-aware filters to the file library endpoint", async () => {
  localStorageState.clear();
  sessionStorageState.clear();
  sessionStorageState.set("omnyid.preview.session", JSON.stringify({
    token: "token-123",
    user: {
      id: "user_1",
      email: "user@example.com",
      display_name: "User",
      auth_provider: "password",
    },
  }));

  const { fetchFileLibrary } = await import("../src/lib/api.ts");
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer token-123");
    return new Response(JSON.stringify({
      items: [],
      count: 0,
      summary: {
        storage_used_bytes: 0,
        storage_quota_bytes: 0,
        visible_bytes: 0,
        matching_count: 0,
      },
      facets: {
        top_tags: [],
        availability_counts: {},
        category_counts: {},
        knowledge_counts: {},
        retention_counts: {},
        linked_count: 0,
      },
      page: {
        limit: 250,
        returned_count: 0,
        matching_count: 0,
        has_more: false,
      },
      filters: {},
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await fetchFileLibrary({
      query: "lecture notes",
      tag: "biology",
      category: "study",
      sourceKind: "parsed_document",
      availability: "extracted_only",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      courseTag: "course:bio101",
      unitTag: "unit:2",
      chapterTag: "chapter:4",
      weekTag: "week:3",
      lectureTag: "lecture:3",
      sort: "recent",
      limit: 250,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestedUrl, /\/api\/files\/library\?/);
  assert.match(requestedUrl, /q=lecture\+notes|q=lecture%20notes/);
  assert.match(requestedUrl, /tag=biology/);
  assert.match(requestedUrl, /category=study/);
  assert.match(requestedUrl, /source_kind=parsed_document/);
  assert.match(requestedUrl, /availability=extracted_only/);
  assert.match(requestedUrl, /knowledge_mode=connected_notes/);
  assert.match(requestedUrl, /retention_mode=keep_extracted_only/);
  assert.match(requestedUrl, /course_tag=course%3Abio101/);
  assert.match(requestedUrl, /unit_tag=unit%3A2/);
  assert.match(requestedUrl, /chapter_tag=chapter%3A4/);
  assert.match(requestedUrl, /week_tag=week%3A3/);
  assert.match(requestedUrl, /lecture_tag=lecture%3A3/);
  assert.match(requestedUrl, /sort=recent/);
  assert.match(requestedUrl, /limit=250/);
});

test("fetchFileLibrary normalizes page and availability facets for retention-aware files", async () => {
  localStorageState.clear();
  sessionStorageState.clear();

  const { fetchFileLibrary } = await import("../src/lib/api.ts");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({
      items: [
        {
          id: "att_1",
          message_id: "msg_1",
          thread_id: "thread_1",
          source_thread_id: "thread_1",
          name: "week3.pdf",
          mime_type: "application/pdf",
          size_bytes: 4096,
          storage: {},
          encryption: {},
          sha256: null,
          created_at: "2026-09-01T10:00:00.000Z",
          source_timestamp: "2026-09-01T10:00:00.000Z",
          source_type: "document",
          source_kind: "parsed_document",
          source_summary: "Week 3 lecture notes",
          source_metadata: {
            attachment_retention_mode: "keep_extracted_only",
            attachment_retention_label: "Keeps extracted notes only",
            knowledge_mode: "connected_notes",
          },
          source_supertags: ["biology", "week-3"],
          download_url: null,
          derived_message_id: "msg_note_1",
          derived_thread_id: "thread_notes_1",
          derived_type: "parsed_document",
        },
        {
          bad: true,
        },
      ],
      count: 2,
      summary: {
        storage_used_bytes: 20480,
        storage_quota_bytes: 1048576,
        visible_bytes: 4096,
        matching_count: 320,
      },
      facets: {
        top_tags: [{ tag: "biology", count: 12 }, { tag: 7, count: "bad" }],
        availability_counts: {
          downloadable: 120,
          extracted_only: 180,
          session_only: 20,
          unavailable: 5,
        },
        category_counts: {
          study: 300,
          audio: 20,
        },
        source_kind_counts: {
          parsed_document: 210,
          transcript: 70,
          unclassified: 40,
        },
        knowledge_counts: {
          connected_notes: 220,
          zettelkasten: 40,
          unclassified: 60,
        },
        retention_counts: {
          keep_file: 120,
          keep_extracted_only: 180,
          keep_nothing: 20,
        },
        academic_kind_counts: {
          lecture_slides: 80,
        },
        course_tag_counts: {
          "course:bio101": 50,
        },
        unit_tag_counts: {
          "unit:2": 40,
        },
        chapter_tag_counts: {
          "chapter:4": 30,
        },
        week_tag_counts: {
          "week:3": 25,
        },
        lecture_tag_counts: {
          "lecture:3": 12,
        },
        linked_count: 260,
      },
      page: {
        limit: 250,
        returned_count: 250,
        matching_count: 320,
        has_more: true,
      },
      filters: {
        category: "study",
        source_kind: "parsed_document",
        availability: "extracted_only",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const response = await fetchFileLibrary({ category: "study", limit: 250 });
    assert.equal(response.items.length, 1);
    assert.equal(response.items[0]?.name, "week3.pdf");
    assert.equal(response.items[0]?.download_url, null);
    assert.equal(response.items[0]?.source_thread_id, "thread_1");
    assert.equal(response.items[0]?.derived_message_id, "msg_note_1");
    assert.equal(response.items[0]?.derived_thread_id, "thread_notes_1");
    assert.equal(response.summary.matching_count, 320);
    assert.equal(response.facets.availability_counts.downloadable, 120);
    assert.equal(response.facets.availability_counts.extracted_only, 180);
    assert.equal(response.facets.availability_counts.unavailable, 5);
    assert.equal(response.facets.category_counts.study, 300);
    assert.equal(response.facets.source_kind_counts.parsed_document, 210);
    assert.equal(response.facets.academic_kind_counts.lecture_slides, 80);
    assert.equal(response.facets.course_tag_counts["course:bio101"], 50);
    assert.equal(response.facets.unit_tag_counts["unit:2"], 40);
    assert.equal(response.facets.chapter_tag_counts["chapter:4"], 30);
    assert.equal(response.facets.week_tag_counts["week:3"], 25);
    assert.equal(response.facets.lecture_tag_counts["lecture:3"], 12);
    assert.equal(response.facets.linked_count, 260);
    assert.equal(response.page.has_more, true);
    assert.equal(response.page.returned_count, 250);
    assert.equal(response.filters.category, "study");
    assert.equal(response.filters.source_kind, "parsed_document");
    assert.equal(response.filters.availability, "extracted_only");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
