/// Background Watcher heuristic packs — life management.
///
/// These packs extend the base heuristic engine (see `proactive_engine.rs`)
/// with rules tuned for everyday life care: allergies, medications, shopping,
/// nutrition, study rhythms, household maintenance, and schedule awareness.
///
/// All heuristics reuse `ProactiveHeuristic` from `proactive_engine` so the
/// same evaluation engine processes both professional and life-care events
/// without duplicating logic.
///
/// Pack IDs:
///   "allergy"    — Allergen detection in shopping lists and meal logs
///   "medication" — Dose timing, drug interactions, refill reminders
///   "shopping"   — Restock alerts, expiry warnings, budget nudges
///   "nutrition"  — Meal pattern analysis, hydration, dietary goal tracking
///   "study"      — Pomodoro breaks, deadline escalation, focus mode
///   "household"  — Bill due dates, maintenance cycles, low-stock household items
///   "schedule"   — Appointment proximity, travel buffer, calendar gaps
use crate::message::{AfpPassiveEventContent, AfpProactiveSuggestionContent};
use crate::proactive_engine::{ActionTemplate, EvaluationResult, ProactiveHeuristic};
use serde_json::{Value, json};
use std::collections::HashMap;

// ── Allergy Pack ──────────────────────────────────────────────────────────────

pub fn allergy_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // AL-01: Known allergen detected in shopping list
        ProactiveHeuristic {
            id: "allergy-shopping-list-conflict".to_string(),
            name: "Allergen in Shopping List".to_string(),
            trigger_event_type: "shopping_list_updated".to_string(),
            conditions: json!({ "contains_allergen": true }),
            action_template: ActionTemplate {
                action_label: "Swap item".to_string(),
                description: "An item on your shopping list may conflict with a known allergy. \
                              Would you like to find a safe alternative?"
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
        // AL-02: Grapefruit / statin interaction (common and serious)
        ProactiveHeuristic {
            id: "allergy-grapefruit-statin".to_string(),
            name: "Grapefruit–Statin Interaction".to_string(),
            trigger_event_type: "shopping_list_updated".to_string(),
            conditions: json!({ "item_name_contains": "grapefruit", "on_statin": true }),
            action_template: ActionTemplate {
                action_label: "Swap to orange juice".to_string(),
                description: "Grapefruit can interfere with statin medications. \
                              Orange juice is a safe and tasty alternative."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.94,
            enabled: true,
        },
        // AL-03: Allergen detected in logged meal
        ProactiveHeuristic {
            id: "allergy-meal-log-conflict".to_string(),
            name: "Allergen in Meal Log".to_string(),
            trigger_event_type: "meal_logged".to_string(),
            conditions: json!({ "contains_allergen": true }),
            action_template: ActionTemplate {
                action_label: "Check ingredients".to_string(),
                description: "This meal may contain an allergen. Review the ingredients \
                              and monitor for any reaction."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // AL-04: New medication added that conflicts with existing allergy
        ProactiveHeuristic {
            id: "allergy-medication-conflict".to_string(),
            name: "Medication Allergy Conflict".to_string(),
            trigger_event_type: "medication_time".to_string(),
            conditions: json!({ "new_medication": true, "allergy_conflict": true }),
            action_template: ActionTemplate {
                action_label: "Review with prescriber".to_string(),
                description: "This medication may interact with a known allergy. \
                              Please verify with your doctor or pharmacist before taking it."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.92,
            enabled: true,
        },
    ]
}

// ── Medication Pack ───────────────────────────────────────────────────────────

pub fn medication_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // MED-01: Morning dose approaching
        ProactiveHeuristic {
            id: "med-reminder-morning".to_string(),
            name: "Morning Medication Reminder".to_string(),
            trigger_event_type: "medication_time".to_string(),
            conditions: json!({ "dose_window": "morning", "not_taken": true }),
            action_template: ActionTemplate {
                action_label: "Mark as taken".to_string(),
                description: "Good morning! Just a gentle reminder to take your morning medication. \
                              Take it with a full glass of water.".to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.95,
            enabled: true,
        },
        // MED-02: Evening dose approaching
        ProactiveHeuristic {
            id: "med-reminder-evening".to_string(),
            name: "Evening Medication Reminder".to_string(),
            trigger_event_type: "medication_time".to_string(),
            conditions: json!({ "dose_window": "evening", "not_taken": true }),
            action_template: ActionTemplate {
                action_label: "Mark as taken".to_string(),
                description: "Time for your evening medication. \
                              Take it with food if your prescription recommends it.".to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.95,
            enabled: true,
        },
        // MED-03: Dose skipped (2+ hours overdue)
        ProactiveHeuristic {
            id: "med-skipped-dose".to_string(),
            name: "Skipped Dose Check".to_string(),
            trigger_event_type: "medication_time".to_string(),
            conditions: json!({ "hours_overdue_min": 2.0, "not_taken": true }),
            action_template: ActionTemplate {
                action_label: "Take now or skip".to_string(),
                description: "It looks like today's dose might have been missed. \
                              Some medications can be taken late — check your prescription or \
                              ask your pharmacist whether to take it now or skip.".to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.87,
            enabled: true,
        },
        // MED-04: Refill needed within 7 days
        ProactiveHeuristic {
            id: "med-refill-reminder".to_string(),
            name: "Medication Refill Needed".to_string(),
            trigger_event_type: "medication_time".to_string(),
            conditions: json!({ "days_supply_remaining_max": 7 }),
            action_template: ActionTemplate {
                action_label: "Request refill".to_string(),
                description: "You have about a week of medication remaining. \
                              Order a refill now to avoid running out.".to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.90,
            enabled: true,
        },
        // MED-05: Drug–drug interaction detected
        ProactiveHeuristic {
            id: "med-drug-interaction".to_string(),
            name: "Drug Interaction Warning".to_string(),
            trigger_event_type: "medication_time".to_string(),
            conditions: json!({ "interaction_detected": true }),
            action_template: ActionTemplate {
                action_label: "Review with prescriber".to_string(),
                description: "Two of your medications may interact. \
                              Please speak with your doctor or pharmacist before taking both together.".to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.92,
            enabled: true,
        },
        // MED-06: Take medication with food reminder
        ProactiveHeuristic {
            id: "med-food-required".to_string(),
            name: "Medication Requires Food".to_string(),
            trigger_event_type: "medication_time".to_string(),
            conditions: json!({ "requires_food": true, "meal_logged_today": false }),
            action_template: ActionTemplate {
                action_label: "Have a snack first".to_string(),
                description: "Your medication works best (and is gentler on your stomach) \
                              when taken with food. Have a light snack before taking it.".to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.82,
            enabled: true,
        },
    ]
}

// ── Shopping Pack ─────────────────────────────────────────────────────────────

pub fn shopping_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // SH-01: Staple item regularly purchased but not on current list
        ProactiveHeuristic {
            id: "shopping-missing-staple".to_string(),
            name: "Staple Item May Be Missing".to_string(),
            trigger_event_type: "shopping_list_updated".to_string(),
            conditions: json!({ "missing_usual_staple": true }),
            action_template: ActionTemplate {
                action_label: "Add to list".to_string(),
                description: "An item you usually buy hasn't been added to your list yet. \
                              Add it before you shop?"
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // SH-02: Item near expiry date detected via log
        ProactiveHeuristic {
            id: "shopping-item-expiring".to_string(),
            name: "Item Expiring Soon".to_string(),
            trigger_event_type: "household_item_low".to_string(),
            conditions: json!({ "days_until_expiry_max": 3 }),
            action_template: ActionTemplate {
                action_label: "Plan to use or replace".to_string(),
                description: "An item in your pantry or fridge expires soon. \
                              Plan a meal around it or replace it on your next shop."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
        // SH-03: Shopping list total estimate exceeds budget
        ProactiveHeuristic {
            id: "shopping-budget-exceeded".to_string(),
            name: "Shopping Budget Alert".to_string(),
            trigger_event_type: "shopping_list_updated".to_string(),
            conditions: json!({ "estimated_total_exceeds_budget": true }),
            action_template: ActionTemplate {
                action_label: "Review list".to_string(),
                description: "Your shopping list looks like it may exceed your usual budget. \
                              Review the items and remove any non-essentials?"
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.72,
            enabled: true,
        },
        // SH-04: Essential household supply running low
        ProactiveHeuristic {
            id: "shopping-household-low".to_string(),
            name: "Household Supply Running Low".to_string(),
            trigger_event_type: "household_item_low".to_string(),
            conditions: json!({ "item_type": "household_essential" }),
            action_template: ActionTemplate {
                action_label: "Add to shopping list".to_string(),
                description: "A household essential is running low. Add it to your shopping list \
                              so you don't run out."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.78,
            enabled: true,
        },
    ]
}

// ── Nutrition Pack ────────────────────────────────────────────────────────────

pub fn nutrition_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // NUT-01: High-sugar meal pattern detected
        ProactiveHeuristic {
            id: "nutrition-high-sugar-pattern".to_string(),
            name: "High Sugar Intake Pattern".to_string(),
            trigger_event_type: "meal_logged".to_string(),
            conditions: json!({ "sugar_level": "high", "consecutive_high_sugar_meals_min": 2 }),
            action_template: ActionTemplate {
                action_label: "View lower-sugar options".to_string(),
                description: "Your last few meals have been higher in sugar. \
                              Balancing with a low-sugar meal or snack would help."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.70,
            enabled: true,
        },
        // NUT-02: Meal skipped (no log for 6+ hours)
        ProactiveHeuristic {
            id: "nutrition-skipped-meal".to_string(),
            name: "Meal Skipped".to_string(),
            trigger_event_type: "meal_logged".to_string(),
            conditions: json!({ "hours_since_last_meal_min": 6.0 }),
            action_template: ActionTemplate {
                action_label: "Log a meal".to_string(),
                description: "It looks like you haven't eaten in a while. \
                              Having a balanced meal or snack would help keep your energy up."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.65,
            enabled: true,
        },
        // NUT-03: Low protein intake for the day
        ProactiveHeuristic {
            id: "nutrition-low-protein".to_string(),
            name: "Low Protein Intake".to_string(),
            trigger_event_type: "meal_logged".to_string(),
            conditions: json!({ "protein_deficit": true }),
            action_template: ActionTemplate {
                action_label: "Suggest protein snack".to_string(),
                description: "Your protein intake today looks a bit low. \
                              A small protein-rich snack like nuts, eggs, or yoghurt could help."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.68,
            enabled: true,
        },
        // NUT-04: Hydration reminder (based on hot weather or low log)
        ProactiveHeuristic {
            id: "nutrition-hydration-reminder".to_string(),
            name: "Hydration Reminder".to_string(),
            trigger_event_type: "weather_alert".to_string(),
            conditions: json!({ "temperature_celsius_min": 28.0 }),
            action_template: ActionTemplate {
                action_label: "Drink water now".to_string(),
                description: "It's a hot day — staying well hydrated is especially important. \
                              Aim for an extra glass of water in the next hour."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
    ]
}

// ── Study Pack ────────────────────────────────────────────────────────────────

/// Normalise an academic event-type string to one of two canonical forms used
/// by the study heuristics below. Call this in event-metadata enrichment before
/// heuristic evaluation so heuristics never need to enumerate synonyms.
///
/// Canonical types:
///   "academic_submission" — assignment, assessment, task, coursework, paper,
///                           practical, lab report, essay, project, portfolio,
///                           take-home, prac, folio, tutorial submission
///   "academic_exam"       — exam, test, quiz, mid-term, midterm, final, viva,
///                           osce, practical exam, in-class test, sitting
pub fn normalise_academic_event_type(raw: &str) -> &'static str {
    let lower = raw.to_lowercase();
    // Submission variants (check before "exam" to catch "practical" before "practical exam")
    let is_submission = lower.contains("assignment")
        || lower.contains("assessment")
        || (lower.contains("task") && !lower.contains("exam"))
        || lower.contains("coursework")
        || lower.contains("essay")
        || lower.contains("paper")
        || lower.contains("portfolio")
        || lower.contains("folio")
        || lower.contains("take-home")
        || lower.contains("lab report")
        || lower.contains("prac")
        || lower.contains("tutorial submission")
        || lower.contains("project");
    // Exam variants
    let is_exam = lower.contains("exam")
        || lower.contains("test")
        || lower.contains("quiz")
        || lower.contains("mid-term")
        || lower.contains("midterm")
        || lower.contains("final")
        || lower.contains("viva")
        || lower.contains("osce")
        || lower.contains("sitting")
        || lower.contains("in-class");

    if is_submission {
        "academic_submission"
    } else if is_exam {
        "academic_exam"
    } else {
        "assignment_due"
    } // legacy fallback
}

pub fn study_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // STU-01: Study session exceeded 25 minutes (Pomodoro break)
        ProactiveHeuristic {
            id: "study-pomodoro-break".to_string(),
            name: "Study Break Due".to_string(),
            trigger_event_type: "study_session_started".to_string(),
            conditions: json!({ "session_duration_minutes_min": 25 }),
            action_template: ActionTemplate {
                action_label: "Take a 5-min break".to_string(),
                description: "You've been studying for a while. A short break helps consolidate \
                              memory and restore focus — try 5 minutes away from the screen."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // STU-02: Academic submission (assignment/assessment/coursework/paper etc.) due ≤48 h
        // "event_type" is normalised to "academic_submission" by normalise_academic_event_type()
        // before events reach the heuristic engine.
        ProactiveHeuristic {
            id: "study-submission-approaching-48h".to_string(),
            name: "Academic Submission Due Soon".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "academic_submission", "hours_until_due_max": 48 }),
            action_template: ActionTemplate {
                action_label: "Review progress".to_string(),
                description: "An assignment, assessment, or coursework submission is due within \
                              48 hours. Check your progress and plan the remaining work now."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.82,
            enabled: true,
        },
        // STU-03: Study session too long — cognitive fatigue risk
        ProactiveHeuristic {
            id: "study-fatigue-risk".to_string(),
            name: "Study Fatigue Risk".to_string(),
            trigger_event_type: "study_session_started".to_string(),
            conditions: json!({ "session_duration_minutes_min": 90 }),
            action_template: ActionTemplate {
                action_label: "Take a longer break".to_string(),
                description: "You've been at it for over 90 minutes — your brain needs a proper \
                              rest to retain what you've learned. Take at least 15 minutes away."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
        // STU-04: Exam/test/quiz in ≤24 h, low study time this week
        ProactiveHeuristic {
            id: "study-exam-prep-low".to_string(),
            name: "Exam Approaching, Low Study Time".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "academic_exam", "hours_until_due_max": 24, "study_hours_this_week_max": 4 }),
            action_template: ActionTemplate {
                action_label: "Start review session".to_string(),
                description:
                    "Your exam or test is tomorrow and study time this week has been limited. \
                              A focused 1-hour review of key concepts can still make a difference."
                        .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
        // STU-05: Submission due ≤7 days with no study sessions recorded
        ProactiveHeuristic {
            id: "study-submission-no-work-7d".to_string(),
            name: "Upcoming Submission — No Study Sessions".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "academic_submission", "days_until_due_max": 7, "study_sessions_this_week": 0 }),
            action_template: ActionTemplate {
                action_label: "Start a session now".to_string(),
                description: "A submission is due within 7 days but no study sessions have been \
                              recorded this week. Getting started now is the highest-leverage \
                              action you can take."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.87,
            enabled: true,
        },
        // STU-06: Exam/test ≤7 days — no dedicated study blocks scheduled
        ProactiveHeuristic {
            id: "study-exam-no-blocks-7d".to_string(),
            name: "Exam in 7 Days — No Study Blocks Scheduled".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "academic_exam", "days_until_due_max": 7, "study_blocks_scheduled": 0 }),
            action_template: ActionTemplate {
                action_label: "Schedule study blocks".to_string(),
                description: "An exam is coming up in 7 days but no dedicated study blocks \
                              are in your calendar. Block time now before everything fills up."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // STU-07: Exam ≤3 days — intensify review
        ProactiveHeuristic {
            id: "study-exam-3d-intensify".to_string(),
            name: "Exam in 3 Days — Intensify Review".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "academic_exam", "days_until_due_max": 3 }),
            action_template: ActionTemplate {
                action_label: "Switch to active recall".to_string(),
                description: "Your exam is 3 days away. Switch from reading to active recall — \
                              flashcards, past papers, and practice questions are the most \
                              effective techniques at this stage."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // STU-08: Multiple academic submissions in the same week
        ProactiveHeuristic {
            id: "study-submission-cluster".to_string(),
            name: "Multiple Submissions This Week".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "academic_submission", "same_week_submission_count_min": 2 }),
            action_template: ActionTemplate {
                action_label: "Sequence your workload".to_string(),
                description: "You have 2 or more assignments, assessments, or coursework \
                              submissions due this week. Sequence them by due date and \
                              allocate focused time for each today."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
        // STU-09: Late-night study session before submission day
        ProactiveHeuristic {
            id: "study-night-before-submission".to_string(),
            name: "Late-Night Study Before Submission".to_string(),
            trigger_event_type: "study_session_started".to_string(),
            conditions: json!({ "hour_of_day_min": 23, "submission_tomorrow": true }),
            action_template: ActionTemplate {
                action_label: "Prioritise sleep".to_string(),
                description: "It's late and you have a submission tomorrow. Sleep improves \
                              memory consolidation and writing quality more than another \
                              hour of studying. Set an alarm and rest."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.82,
            enabled: true,
        },
        // STU-10: Late-night study the night before an exam
        ProactiveHeuristic {
            id: "study-night-before-exam".to_string(),
            name: "Late-Night Study Before Exam".to_string(),
            trigger_event_type: "study_session_started".to_string(),
            conditions: json!({ "hour_of_day_min": 22, "exam_tomorrow": true }),
            action_template: ActionTemplate {
                action_label: "Get some sleep".to_string(),
                description: "You have an exam tomorrow and it's getting late. Sleep is more \
                              beneficial than cramming now — your recall and reasoning will \
                              be sharper after proper rest."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // STU-11: Consecutive study hours > 4 with no break
        ProactiveHeuristic {
            id: "study-extended-no-break".to_string(),
            name: "Extended Study — No Break Detected".to_string(),
            trigger_event_type: "study_session_started".to_string(),
            conditions: json!({ "cumulative_hours_without_break_min": 4 }),
            action_template: ActionTemplate {
                action_label: "Take a 20-min break".to_string(),
                description: "You've been studying for 4+ hours without a proper break. \
                              A 20-minute break — walk, snack, or rest — will restore \
                              focus and improve retention for the rest of the session."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.90,
            enabled: true,
        },
        // STU-12: Academic submission with no outline or plan created
        ProactiveHeuristic {
            id: "study-submission-no-outline".to_string(),
            name: "Submission Due — No Plan Created".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "academic_submission", "days_until_due_max": 14, "outline_exists": false }),
            action_template: ActionTemplate {
                action_label: "Create an outline".to_string(),
                description: "A submission is due in 2 weeks but no plan or outline has been \
                              created yet. A 30-minute planning session now will save \
                              hours of scattered work later."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
        // STU-13: Exam date approaching — no study blocks scheduled at all
        ProactiveHeuristic {
            id: "study-exam-no-calendar-block".to_string(),
            name: "Exam Date Set — No Study in Calendar".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "academic_exam", "days_until_due_max": 21, "study_blocks_scheduled": 0 }),
            action_template: ActionTemplate {
                action_label: "Block study time now".to_string(),
                description: "An exam, test, or in-class assessment is 3 weeks away and \
                              no study blocks are in your calendar. Scheduling now locks \
                              in your preparation time before other commitments fill it."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.78,
            enabled: true,
        },
        // STU-14: Unread course materials the day before an assessment
        ProactiveHeuristic {
            id: "study-unread-materials-day-before".to_string(),
            name: "Unread Course Materials Before Assessment".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "academic_exam", "hours_until_due_max": 24, "unread_course_materials_count_min": 3 }),
            action_template: ActionTemplate {
                action_label: "Prioritise key materials".to_string(),
                description: "There are unread course materials and your exam or assessment \
                              is tomorrow. Prioritise the most recent lectures and summary \
                              notes — don't try to read everything."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.83,
            enabled: true,
        },
        // STU-15: Study group scheduled — prep reminder
        ProactiveHeuristic {
            id: "study-group-prep".to_string(),
            name: "Study Group — Prepare Beforehand".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "study_group", "hours_until_due_max": 2, "self_prepared": false }),
            action_template: ActionTemplate {
                action_label: "Review your notes".to_string(),
                description: "A study group session is starting in 2 hours. Reviewing your \
                              notes beforehand makes the session more effective for everyone."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // STU-16: Academic submission uploaded — extract grading criteria to task list
        ProactiveHeuristic {
            id: "study-brief-uploaded".to_string(),
            name: "Assignment Brief Uploaded — Extract Criteria".to_string(),
            trigger_event_type: "note_created".to_string(),
            conditions: json!({ "file_type": "assignment_brief", "criteria_extracted": false }),
            action_template: ActionTemplate {
                action_label: "Extract grading criteria".to_string(),
                description: "An assignment brief or rubric has been uploaded. Extracting \
                              the grading criteria into a checklist helps you track exactly \
                              what's needed for full marks."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.83,
            enabled: true,
        },
    ]
}

// ── Household Pack ────────────────────────────────────────────────────────────

pub fn household_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // HH-01: Bill payment due within 3 days
        ProactiveHeuristic {
            id: "household-bill-due".to_string(),
            name: "Bill Payment Due Soon".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "bill_due", "days_until_due_max": 3 }),
            action_template: ActionTemplate {
                action_label: "Pay now".to_string(),
                description: "A bill payment is due in the next 3 days. Pay it now to avoid \
                              late fees."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.90,
            enabled: true,
        },
        // HH-02: Regular home maintenance reminder (monthly/quarterly)
        ProactiveHeuristic {
            id: "household-maintenance-cycle".to_string(),
            name: "Home Maintenance Reminder".to_string(),
            trigger_event_type: "household_item_low".to_string(),
            conditions: json!({ "maintenance_due": true }),
            action_template: ActionTemplate {
                action_label: "Schedule maintenance".to_string(),
                description: "It's time for a routine home maintenance check. \
                              A few minutes now can prevent bigger issues later."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.72,
            enabled: true,
        },
        // HH-03: Pet care reminder (feeding, medication, vet appointment)
        ProactiveHeuristic {
            id: "household-pet-care".to_string(),
            name: "Pet Care Reminder".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "pet_care" }),
            action_template: ActionTemplate {
                action_label: "Check pet needs".to_string(),
                description: "A pet care task is due soon — feeding, medication, or a vet visit. \
                              Checking now helps keep your pet healthy and happy."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
        // HH-04: Household member appointment today
        ProactiveHeuristic {
            id: "household-member-appointment".to_string(),
            name: "Household Member Appointment Today".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "is_household_member": true, "hours_until_due_max": 2 }),
            action_template: ActionTemplate {
                action_label: "Review appointment".to_string(),
                description: "A household member has an appointment coming up soon. \
                              Check if transport, documents, or any preparation is needed."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
    ]
}

// ── Schedule Pack ─────────────────────────────────────────────────────────────

pub fn schedule_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // SCH-01: Appointment within 1 hour, no travel time buffered
        ProactiveHeuristic {
            id: "schedule-travel-buffer-missing".to_string(),
            name: "No Travel Buffer Before Appointment".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "hours_until_due_max": 1, "travel_required": true, "travel_buffer_minutes_min": 0 }),
            action_template: ActionTemplate {
                action_label: "Leave soon".to_string(),
                description: "You have an appointment coming up and travel time hasn't been \
                              accounted for. Leave now to arrive with time to spare."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
        // SCH-02: Back-to-back appointments with no break
        ProactiveHeuristic {
            id: "schedule-no-break-between-appointments".to_string(),
            name: "No Break Between Appointments".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "next_appointment_gap_minutes_max": 10 }),
            action_template: ActionTemplate {
                action_label: "Wrap up early".to_string(),
                description: "You have two appointments back-to-back with very little gap. \
                              Wrapping up the current one a few minutes early will help."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // SCH-03: Medical appointment — bring test results reminder
        ProactiveHeuristic {
            id: "schedule-medical-prep".to_string(),
            name: "Medical Appointment Preparation".to_string(),
            trigger_event_type: "appointment_approaching".to_string(),
            conditions: json!({ "event_type": "medical", "hours_until_due_max": 24 }),
            action_template: ActionTemplate {
                action_label: "Check appointment prep".to_string(),
                description: "You have a medical appointment coming up. Make sure you have \
                              any test results, referral letters, Medicare card, or medications \
                              ready to take along."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.82,
            enabled: true,
        },
        // SCH-04: Meeting rescheduled to overlap an existing deadline block
        //
        // Fired when a calendar_event_updated event carries conflict_type=deadline,
        // meaning the updated event time now overlaps a task with a hard deadline.
        // The suggestion carries conflict_actions metadata so the UI can render
        // "Reschedule Meeting" / "Move Deadline" buttons instead of generic "Do it".
        ProactiveHeuristic {
            id: "schedule-conflict-deadline".to_string(),
            name: "Meeting Conflicts With Deadline".to_string(),
            trigger_event_type: "calendar_event_updated".to_string(),
            conditions: json!({ "conflict_type": "deadline" }),
            action_template: ActionTemplate {
                action_label: "Resolve conflict".to_string(),
                description: "A meeting has been moved to a time that overlaps one of your \
                              deadlines. Reschedule the meeting or adjust the deadline to \
                              keep your day on track."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.90,
            enabled: true,
        },
        // SCH-05: New event created that overlaps a protected deadline block
        ProactiveHeuristic {
            id: "schedule-new-event-deadline-overlap".to_string(),
            name: "New Event Overlaps Deadline Block".to_string(),
            trigger_event_type: "calendar_event_created".to_string(),
            conditions: json!({ "overlaps_deadline_block": true }),
            action_template: ActionTemplate {
                action_label: "Resolve conflict".to_string(),
                description: "A newly added event overlaps time you have blocked for a \
                              deadline. Reschedule the event or extend the deadline to \
                              protect your focus time."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
    ]
}

// ── Email Triage Pack ─────────────────────────────────────────────────────────

pub fn email_triage_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // EM-01: Email with urgency keywords — LLM gate candidate
        ProactiveHeuristic {
            id: "email-urgent-keyword".to_string(),
            name: "Urgent Email Detected".to_string(),
            trigger_event_type: "email_incoming".to_string(),
            conditions: json!({ "urgency_score_min": 0.7 }),
            action_template: ActionTemplate {
                action_label: "Review email".to_string(),
                description: "An incoming email has been flagged as potentially urgent. \
                              Review it now to determine if immediate action is needed."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // EM-02: Email from a VIP contact unreplied for 4+ hours
        ProactiveHeuristic {
            id: "email-vip-unreplied".to_string(),
            name: "VIP Email Unreplied".to_string(),
            trigger_event_type: "email_incoming".to_string(),
            conditions: json!({ "from_vip_contact": true, "hours_unreplied_min": 4.0 }),
            action_template: ActionTemplate {
                action_label: "Reply now".to_string(),
                description: "A VIP contact has been waiting for a reply for several hours. \
                              A timely response maintains the relationship."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.82,
            enabled: true,
        },
        // EM-03: High-impact email requiring an action (contract, approval, etc.)
        ProactiveHeuristic {
            id: "email-action-required".to_string(),
            name: "Email Requires Action".to_string(),
            trigger_event_type: "email_incoming".to_string(),
            conditions: json!({ "requires_action": true, "impact": "high" }),
            action_template: ActionTemplate {
                action_label: "Act on email".to_string(),
                description: "This email contains a high-impact action item — such as a contract, \
                              approval request, or deadline notification. It needs your attention."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.78,
            enabled: true,
        },
        // EM-04: Email classified as Urgent + High-Impact by the LLM gate
        ProactiveHeuristic {
            id: "email-llm-high-impact".to_string(),
            name: "High-Impact Email (AI Classified)".to_string(),
            trigger_event_type: "email_incoming".to_string(),
            conditions: json!({ "llm_impact_label": "high", "llm_urgency_label": "urgent" }),
            action_template: ActionTemplate {
                action_label: "Review now".to_string(),
                description:
                    "Your AI assistant has classified this email as high-impact and urgent. \
                              Review the full message before deciding next steps."
                        .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
    ]
}

// ── Calendar Events Pack ──────────────────────────────────────────────────────

pub fn calendar_events_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // CAL-01: Event starting in 30 minutes
        ProactiveHeuristic {
            id: "cal-event-starting-soon".to_string(),
            name: "Event Starting Soon".to_string(),
            trigger_event_type: "calendar_event_approaching".to_string(),
            conditions: json!({ "minutes_until_start_max": 30 }),
            action_template: ActionTemplate {
                action_label: "Prepare now".to_string(),
                description: "An event on your calendar starts in 30 minutes. \
                              Wrap up what you're doing and prepare any materials you need."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.90,
            enabled: true,
        },
        // CAL-02: Public holiday tomorrow that may affect work plans
        ProactiveHeuristic {
            id: "cal-public-holiday-tomorrow".to_string(),
            name: "Public Holiday Tomorrow".to_string(),
            trigger_event_type: "calendar_event_approaching".to_string(),
            conditions: json!({ "event_type": "public_holiday", "days_until_start_max": 1 }),
            action_template: ActionTemplate {
                action_label: "Adjust tomorrow's plans".to_string(),
                description: "Tomorrow is a public holiday. Check whether any scheduled \
                              meetings, deliveries, or work tasks need to be moved."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // CAL-03: Calendar conflict (two events overlapping)
        ProactiveHeuristic {
            id: "cal-conflict-detected".to_string(),
            name: "Calendar Conflict".to_string(),
            trigger_event_type: "calendar_event_approaching".to_string(),
            conditions: json!({ "has_overlap_conflict": true }),
            action_template: ActionTemplate {
                action_label: "Resolve conflict".to_string(),
                description: "Two events on your calendar overlap. Decide which to attend \
                              or reschedule, or ask your agent to find a better time."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
        // CAL-04: Recurring event missed two or more times in a row
        ProactiveHeuristic {
            id: "cal-recurring-missed".to_string(),
            name: "Recurring Event Pattern Missed".to_string(),
            trigger_event_type: "calendar_event_approaching".to_string(),
            conditions: json!({ "is_recurring": true, "attendance_streak_missed_min": 2 }),
            action_template: ActionTemplate {
                action_label: "Catch up or cancel".to_string(),
                description: "You've missed this recurring event a few times in a row. \
                              Decide whether to catch up or remove it from your schedule."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.72,
            enabled: true,
        },
    ]
}

// ── Weather Events Pack ───────────────────────────────────────────────────────

pub fn weather_events_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // WEA-01: Severe weather warning (storm, flood, cyclone)
        ProactiveHeuristic {
            id: "weather-severe-warning".to_string(),
            name: "Severe Weather Warning".to_string(),
            trigger_event_type: "weather_alert".to_string(),
            conditions: json!({ "severity": "severe" }),
            action_template: ActionTemplate {
                action_label: "Check safety plan".to_string(),
                description: "A severe weather event has been issued for your area. \
                              Review your safety plan, stock essentials, and check travel plans."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.90,
            enabled: true,
        },
        // WEA-02: Outdoor activity planned on a day with heavy rain forecast
        ProactiveHeuristic {
            id: "weather-outdoor-conflict".to_string(),
            name: "Weather Conflict with Outdoor Plans".to_string(),
            trigger_event_type: "weather_alert".to_string(),
            conditions: json!({ "outdoor_event_scheduled": true, "condition": "rain_heavy" }),
            action_template: ActionTemplate {
                action_label: "Reschedule outdoor event".to_string(),
                description:
                    "Heavy rain is forecast on a day you have an outdoor event scheduled. \
                              Consider rescheduling or having a backup indoor plan."
                        .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
        // WEA-03: Storm warning within 24 hours of a travel day
        ProactiveHeuristic {
            id: "weather-travel-warning".to_string(),
            name: "Storm Warning Before Travel".to_string(),
            trigger_event_type: "weather_alert".to_string(),
            conditions: json!({ "travel_day_within_hours_max": 24, "condition": "storm" }),
            action_template: ActionTemplate {
                action_label: "Check travel status".to_string(),
                description: "A storm is forecast before your travel date. \
                              Check with your airline or transport provider for delays."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.83,
            enabled: true,
        },
    ]
}

// ── Traffic Events Pack ───────────────────────────────────────────────────────

pub fn traffic_events_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // TRA-01: Major incident on usual commute route
        ProactiveHeuristic {
            id: "traffic-commute-incident".to_string(),
            name: "Traffic Incident on Commute Route".to_string(),
            trigger_event_type: "traffic_alert".to_string(),
            conditions: json!({ "on_usual_route": true, "severity": "major" }),
            action_template: ActionTemplate {
                action_label: "Find alternate route".to_string(),
                description: "There is a major traffic incident on your usual commute route. \
                              Leave early or use an alternate route to avoid delays."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // TRA-02: Road closure near upcoming appointment location
        ProactiveHeuristic {
            id: "traffic-closure-near-appointment".to_string(),
            name: "Road Closure Near Appointment".to_string(),
            trigger_event_type: "traffic_alert".to_string(),
            conditions: json!({ "near_scheduled_appointment": true, "closure": true }),
            action_template: ActionTemplate {
                action_label: "Plan alternate route".to_string(),
                description:
                    "A road closure has been reported near your upcoming appointment location. \
                              Allow extra travel time or plan an alternate route."
                        .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.82,
            enabled: true,
        },
    ]
}

// ── News Events Pack ──────────────────────────────────────────────────────────

pub fn news_events_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // NEWS-01: Catastrophic event with local impact
        ProactiveHeuristic {
            id: "news-catastrophic-local".to_string(),
            name: "Catastrophic Local News Event".to_string(),
            trigger_event_type: "news_alert".to_string(),
            conditions: json!({ "impact_level": "catastrophic", "is_local": true }),
            action_template: ActionTemplate {
                action_label: "Review safety measures".to_string(),
                description: "A major local event is being reported that may affect your area. \
                              Review emergency guidelines and keep your household informed."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // NEWS-02: Major economic event affecting financial plans or holdings
        ProactiveHeuristic {
            id: "news-economic-impact".to_string(),
            name: "Major Economic Event".to_string(),
            trigger_event_type: "news_alert".to_string(),
            conditions: json!({ "category": "economy", "impact_level": "high", "affects_user_holdings": true }),
            action_template: ActionTemplate {
                action_label: "Review financial exposure".to_string(),
                description: "A significant economic event has been reported that may affect your \
                              investments or financial plans. Consider reviewing your position."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // NEWS-03: Public health alert issued for user's area
        ProactiveHeuristic {
            id: "news-health-alert".to_string(),
            name: "Public Health Alert".to_string(),
            trigger_event_type: "news_alert".to_string(),
            conditions: json!({ "category": "health", "is_local": true, "urgency": "high" }),
            action_template: ActionTemplate {
                action_label: "Check health advisory".to_string(),
                description: "A public health advisory has been issued for your area. \
                              Check the official guidance and take any recommended precautions."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
    ]
}

// ── Task & To-Do Pack ─────────────────────────────────────────────────────────

pub fn task_todo_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // TASK-01: High-priority task is overdue
        ProactiveHeuristic {
            id: "task-overdue-high-priority".to_string(),
            name: "Overdue High-Priority Task".to_string(),
            trigger_event_type: "task_status_changed".to_string(),
            conditions: json!({ "is_overdue": true, "priority": "high" }),
            action_template: ActionTemplate {
                action_label: "Tackle now".to_string(),
                description: "A high-priority task is past its due date. \
                              Address it now or reschedule to keep your commitments on track."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.90,
            enabled: true,
        },
        // TASK-02: High-priority task not started, due within 3 days
        ProactiveHeuristic {
            id: "task-unstarted-approaching".to_string(),
            name: "Unstarted Task Due Soon".to_string(),
            trigger_event_type: "task_status_changed".to_string(),
            conditions: json!({ "status": "not_started", "priority": "high", "days_until_due_max": 3 }),
            action_template: ActionTemplate {
                action_label: "Start today".to_string(),
                description:
                    "An important task is due in less than 3 days and hasn't been started yet. \
                              Begin now to give yourself enough time to complete it well."
                        .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // TASK-03: No tasks scheduled for today despite a pending backlog
        ProactiveHeuristic {
            id: "task-empty-today".to_string(),
            name: "No Tasks Scheduled Today".to_string(),
            trigger_event_type: "task_status_changed".to_string(),
            conditions: json!({ "tasks_due_today": 0, "pending_tasks_min": 3 }),
            action_template: ActionTemplate {
                action_label: "Plan today's work".to_string(),
                description: "You have no tasks scheduled for today, but there are pending items \
                              awaiting your attention. Take 5 minutes to plan which ones to tackle."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.70,
            enabled: true,
        },
        // TASK-04: Shopping or to-do list not updated in 7 days
        ProactiveHeuristic {
            id: "task-list-stale".to_string(),
            name: "Task List May Be Stale".to_string(),
            trigger_event_type: "task_status_changed".to_string(),
            conditions: json!({ "task_type": "list", "days_since_last_update_min": 7 }),
            action_template: ActionTemplate {
                action_label: "Review list".to_string(),
                description: "A to-do or shopping list hasn't been updated in a week. \
                              Review it to make sure it's still current."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.68,
            enabled: true,
        },
    ]
}

// ── Goal Tracking Pack ────────────────────────────────────────────────────────

pub fn goal_tracking_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // GOAL-01: Long-term goal detected without a structured breakdown
        ProactiveHeuristic {
            id: "goal-needs-breakdown".to_string(),
            name: "Goal Needs Breakdown".to_string(),
            trigger_event_type: "goal_detected".to_string(),
            conditions: json!({ "has_breakdown": false, "horizon_days_min": 30 }),
            action_template: ActionTemplate {
                action_label: "Break down this goal".to_string(),
                description: "A long-term goal has been detected. To make steady progress, \
                              it needs to be broken into milestones and weekly tasks. \
                              Your AI assistant can help plan this with you."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
        // GOAL-02: Weekly goal check-in is due
        ProactiveHeuristic {
            id: "goal-weekly-checkin".to_string(),
            name: "Weekly Goal Check-In Due".to_string(),
            trigger_event_type: "goal_detected".to_string(),
            conditions: json!({ "days_since_last_checkin_min": 7, "has_breakdown": true }),
            action_template: ActionTemplate {
                action_label: "Review goal progress".to_string(),
                description: "It's been a week since you last checked in on this goal. \
                              A quick review keeps you on track and surfaces blockers early."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // GOAL-03: Goal milestone approaching within 2 weeks
        ProactiveHeuristic {
            id: "goal-milestone-approaching".to_string(),
            name: "Goal Milestone Approaching".to_string(),
            trigger_event_type: "goal_detected".to_string(),
            conditions: json!({ "days_until_milestone_max": 14 }),
            action_template: ActionTemplate {
                action_label: "Prepare for milestone".to_string(),
                description: "A milestone for one of your goals is coming up in 2 weeks. \
                              Review your progress and make sure you're ready to achieve it."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.82,
            enabled: true,
        },
        // GOAL-04: Progress this week is below 30% of what was scheduled
        ProactiveHeuristic {
            id: "goal-low-progress".to_string(),
            name: "Low Progress on Goal This Week".to_string(),
            trigger_event_type: "goal_detected".to_string(),
            conditions: json!({ "progress_pct_this_week_max": 30.0, "has_scheduled_tasks": true }),
            action_template: ActionTemplate {
                action_label: "Get back on track".to_string(),
                description:
                    "Progress on one of your goals has been slower than planned this week. \
                              A short session now can help you catch up before the week ends."
                        .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.72,
            enabled: true,
        },
    ]
}

// ── Meeting Pack ──────────────────────────────────────────────────────────────

pub fn meeting_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // MTG-01: Meeting within 24 h but no agenda exists
        ProactiveHeuristic {
            id: "mtg-no-agenda".to_string(),
            name: "Meeting Missing Agenda".to_string(),
            trigger_event_type: "calendar_event_approaching".to_string(),
            conditions: json!({ "hours_until_start_max": 24, "agenda_exists": false }),
            action_template: ActionTemplate {
                action_label: "Draft agenda".to_string(),
                description: "A meeting is coming up in less than 24 hours but has no agenda. \
                              A short agenda keeps the conversation focused and respects \
                              attendees' time."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.82,
            enabled: true,
        },
        // MTG-02: Meeting has external attendees and no briefing notes opened
        ProactiveHeuristic {
            id: "mtg-no-briefing-external".to_string(),
            name: "External Attendees — No Briefing Notes".to_string(),
            trigger_event_type: "calendar_event_approaching".to_string(),
            conditions: json!({ "has_external_attendees": true, "briefing_notes_opened": false, "hours_until_start_max": 2 }),
            action_template: ActionTemplate {
                action_label: "Open attendee summaries".to_string(),
                description: "You have a meeting with external attendees but haven't reviewed \
                              briefing notes yet. Surface context to walk in prepared."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
        // MTG-03: High-importance meeting with <30 min preparation time remaining
        ProactiveHeuristic {
            id: "mtg-high-importance-low-prep".to_string(),
            name: "High-Stakes Meeting — Short Prep Window".to_string(),
            trigger_event_type: "calendar_event_approaching".to_string(),
            conditions: json!({ "importance": "high", "prep_minutes_remaining_max": 30 }),
            action_template: ActionTemplate {
                action_label: "Protect focus block".to_string(),
                description: "A high-importance meeting is approaching and your preparation \
                              window is under 30 minutes. Block interruptions and focus now."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
        // MTG-04: Meeting with >8 attendees and no facilitator assigned
        ProactiveHeuristic {
            id: "mtg-large-no-facilitator".to_string(),
            name: "Large Meeting — No Facilitator".to_string(),
            trigger_event_type: "calendar_event_approaching".to_string(),
            conditions: json!({ "attendee_count_min": 8, "facilitator_assigned": false, "hours_until_start_max": 4 }),
            action_template: ActionTemplate {
                action_label: "Assign facilitator".to_string(),
                description: "This meeting has 8 or more attendees but no facilitator or \
                              note-taker assigned. Designating one increases the chance of \
                              useful outcomes."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // MTG-05: Meeting ended with no action items recorded
        ProactiveHeuristic {
            id: "mtg-no-action-items".to_string(),
            name: "Meeting Ended — No Action Items".to_string(),
            trigger_event_type: "calendar_event_completed".to_string(),
            conditions: json!({ "action_items_recorded": false }),
            action_template: ActionTemplate {
                action_label: "Extract action items".to_string(),
                description: "This meeting just ended but no action items were captured. \
                              Run the extraction workflow now before details fade."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // MTG-06: Same unresolved topic appears across 3+ meetings
        ProactiveHeuristic {
            id: "mtg-recurring-blockage".to_string(),
            name: "Recurring Meeting Blockage".to_string(),
            trigger_event_type: "calendar_event_completed".to_string(),
            conditions: json!({ "recurring_unresolved_topic_count_min": 3 }),
            action_template: ActionTemplate {
                action_label: "Flag operational blockage".to_string(),
                description: "The same topic has gone unresolved across 3 or more meetings. \
                              This signals a systematic blockage that needs direct ownership \
                              or escalation."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.78,
            enabled: true,
        },
        // MTG-07: Meeting contains negotiation language — preserve transcript
        ProactiveHeuristic {
            id: "mtg-negotiation-preserve".to_string(),
            name: "Negotiation Meeting — Preserve Record".to_string(),
            trigger_event_type: "calendar_event_completed".to_string(),
            conditions: json!({ "negotiation_language_detected": true }),
            action_template: ActionTemplate {
                action_label: "Preserve transcript".to_string(),
                description: "This meeting contained negotiation language. The transcript \
                              and any agreements should be preserved as a permanent record."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
        // MTG-08: High-stakes presentation upcoming — block rehearsal time
        ProactiveHeuristic {
            id: "mtg-presentation-rehearsal".to_string(),
            name: "Presentation — Block Rehearsal Time".to_string(),
            trigger_event_type: "calendar_event_approaching".to_string(),
            conditions: json!({ "event_subtype": "presentation", "days_until_start_max": 3, "rehearsal_block_scheduled": false }),
            action_template: ActionTemplate {
                action_label: "Schedule rehearsal".to_string(),
                description: "A high-stakes presentation is coming up in the next 3 days \
                              and no rehearsal time is blocked. Add a slot to practise \
                              and tighten your delivery."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.82,
            enabled: true,
        },
        // MTG-09: CEO/founder/board meeting approaching — surface strategic context
        ProactiveHeuristic {
            id: "mtg-executive-context".to_string(),
            name: "Executive Meeting — Surface Context".to_string(),
            trigger_event_type: "calendar_event_approaching".to_string(),
            conditions: json!({ "attendee_role": "executive", "hours_until_start_max": 24 }),
            action_template: ActionTemplate {
                action_label: "Load strategic context".to_string(),
                description: "An executive or board meeting is approaching. Surface relevant \
                              decisions, open items, and metrics packs automatically."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // MTG-10: Meeting repeatedly rescheduled — flag coordination instability
        ProactiveHeuristic {
            id: "mtg-reschedule-instability".to_string(),
            name: "Repeated Rescheduling Detected".to_string(),
            trigger_event_type: "calendar_event_updated".to_string(),
            conditions: json!({ "reschedule_count_min": 3 }),
            action_template: ActionTemplate {
                action_label: "Address coordination issue".to_string(),
                description: "This meeting has been rescheduled 3 or more times. This usually \
                              signals a coordination or commitment problem worth addressing directly."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
    ]
}

// ── Deadline Pack ─────────────────────────────────────────────────────────────

pub fn deadline_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // DL-01: Deadline within 72 h and work not started
        ProactiveHeuristic {
            id: "deadline-unstarted-72h".to_string(),
            name: "Deadline in 72 h — Not Started".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "hours_until_due_max": 72, "work_started": false }),
            action_template: ActionTemplate {
                action_label: "Start now".to_string(),
                description: "A deadline is less than 72 hours away and no work has been \
                              recorded on it yet. Begin immediately to avoid a last-minute crunch."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.92,
            enabled: true,
        },
        // DL-02: Deadline tied to legal compliance — prevent suppression
        ProactiveHeuristic {
            id: "deadline-legal-compliance".to_string(),
            name: "Legal Compliance Deadline".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "category": "legal_compliance" }),
            action_template: ActionTemplate {
                action_label: "Review compliance status".to_string(),
                description: "A legal or compliance deadline is approaching. These cannot be \
                              dismissed — verify your obligations are met or escalate now."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.95,
            enabled: true,
        },
        // DL-03: Multiple deadlines cluster on the same day
        ProactiveHeuristic {
            id: "deadline-cluster-day".to_string(),
            name: "Deadline Cluster Detected".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "same_day_deadline_count_min": 3 }),
            action_template: ActionTemplate {
                action_label: "Re-sequence workload".to_string(),
                description: "Three or more deadlines fall on the same day. Re-sequence them \
                              now to distribute pressure and prevent missed commitments."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
        // DL-04: Deadline linked to financial penalty
        ProactiveHeuristic {
            id: "deadline-financial-penalty".to_string(),
            name: "Deadline with Financial Penalty".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "has_financial_penalty": true }),
            action_template: ActionTemplate {
                action_label: "Prioritise immediately".to_string(),
                description: "Missing this deadline triggers a financial penalty. \
                              Treat it as the highest-priority item until resolved."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.93,
            enabled: true,
        },
        // DL-05: Critical deadline approaching during travel
        ProactiveHeuristic {
            id: "deadline-travel-collision".to_string(),
            name: "Deadline During Travel".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "user_travelling": true, "days_until_due_max": 3 }),
            action_template: ActionTemplate {
                action_label: "Prepare mobile contingency".to_string(),
                description: "A critical deadline falls while you are travelling. \
                              Prepare a mobile workflow or delegate before you depart."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
        // DL-06: Deadline overlaps public holiday
        ProactiveHeuristic {
            id: "deadline-public-holiday-overlap".to_string(),
            name: "Deadline on Public Holiday".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "overlaps_public_holiday": true }),
            action_template: ActionTemplate {
                action_label: "Advance deadline reminders".to_string(),
                description: "This deadline falls on or around a public holiday. \
                              Advance your work or set earlier internal reminders to avoid \
                              being caught off-guard."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // DL-07: Deadline repeatedly postponed — flag strategic neglect
        ProactiveHeuristic {
            id: "deadline-repeated-postpone".to_string(),
            name: "Deadline Repeatedly Postponed".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "postpone_count_min": 3 }),
            action_template: ActionTemplate {
                action_label: "Reassess or close".to_string(),
                description: "This deadline has been postponed 3 or more times. Either commit \
                              to completing it now or deliberately close it to clear cognitive load."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.78,
            enabled: true,
        },
        // DL-08: Deadline exceeded silently — generate accountability review
        ProactiveHeuristic {
            id: "deadline-exceeded-silent".to_string(),
            name: "Deadline Exceeded Without Alert".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "is_overdue": true, "alert_sent": false }),
            action_template: ActionTemplate {
                action_label: "Generate accountability review".to_string(),
                description: "A deadline has passed without a formal review or alert. \
                              Document what happened to avoid the same pattern repeating."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.87,
            enabled: true,
        },
        // DL-09: High-complexity task but calendar is fragmented — protect block
        ProactiveHeuristic {
            id: "deadline-complex-fragmented-calendar".to_string(),
            name: "Complex Deadline — Fragmented Calendar".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "task_complexity": "high", "calendar_fragmentation": "high", "days_until_due_max": 7 }),
            action_template: ActionTemplate {
                action_label: "Protect focus block".to_string(),
                description: "A high-complexity task is due soon, but your calendar is \
                              heavily fragmented. Block at least 2 uninterrupted hours to \
                              make meaningful progress."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.80,
            enabled: true,
        },
        // DL-10: Deadline involves government lodgement — verify portal early
        ProactiveHeuristic {
            id: "deadline-government-lodgement".to_string(),
            name: "Government Lodgement Deadline".to_string(),
            trigger_event_type: "deadline_approaching".to_string(),
            conditions: json!({ "category": "government_lodgement", "days_until_due_max": 7 }),
            action_template: ActionTemplate {
                action_label: "Verify portal access".to_string(),
                description: "A government lodgement deadline is approaching. \
                              Log into the portal now to verify your credentials and check \
                              for required documents before the last minute."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
    ]
}

// ── Finance Pack ──────────────────────────────────────────────────────────────

pub fn finance_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // FIN-01: Bill due within 3 days
        ProactiveHeuristic {
            id: "fin-bill-due-3d".to_string(),
            name: "Bill Due in 3 Days".to_string(),
            trigger_event_type: "finance_event".to_string(),
            conditions: json!({ "event_subtype": "bill_due", "days_until_due_max": 3 }),
            action_template: ActionTemplate {
                action_label: "Pay now".to_string(),
                description: "A bill is due within 3 days. Pay it now to avoid late fees \
                              or service interruptions."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.90,
            enabled: true,
        },
        // FIN-02: Cashflow projection goes negative
        ProactiveHeuristic {
            id: "fin-cashflow-negative".to_string(),
            name: "Negative Cashflow Projection".to_string(),
            trigger_event_type: "finance_event".to_string(),
            conditions: json!({ "event_subtype": "cashflow_projection", "projected_balance_min": -1.0 }),
            action_template: ActionTemplate {
                action_label: "Prioritise receivables".to_string(),
                description: "Your cashflow projection shows a negative balance ahead. \
                              Follow up on outstanding receivables or defer non-essential \
                              expenses to stabilise."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
        // FIN-03: Financial year end approaching — prepare tax documents
        ProactiveHeuristic {
            id: "fin-fye-approaching".to_string(),
            name: "Financial Year End Approaching".to_string(),
            trigger_event_type: "finance_event".to_string(),
            conditions: json!({ "event_subtype": "fye_approaching", "days_until_due_max": 30 }),
            action_template: ActionTemplate {
                action_label: "Start tax document checklist".to_string(),
                description: "Financial year end is within 30 days. Start gathering receipts, \
                              invoices, and financial records now to avoid a last-minute scramble."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // FIN-04: ATO/tax authority deadline approaching
        ProactiveHeuristic {
            id: "fin-ato-deadline".to_string(),
            name: "Tax Authority Deadline".to_string(),
            trigger_event_type: "finance_event".to_string(),
            conditions: json!({ "event_subtype": "tax_deadline", "days_until_due_max": 14 }),
            action_template: ActionTemplate {
                action_label: "Review compliance status".to_string(),
                description: "A tax authority deadline is approaching. Confirm your lodgement \
                              status and gather any outstanding documents."
                    .to_string(),
                urgency: "urgent".to_string(),
            },
            confidence_threshold: 0.93,
            enabled: true,
        },
        // FIN-05: Large recurring expense increases unexpectedly
        ProactiveHeuristic {
            id: "fin-expense-anomaly".to_string(),
            name: "Unexpected Expense Increase".to_string(),
            trigger_event_type: "finance_event".to_string(),
            conditions: json!({ "event_subtype": "expense_spike", "variance_pct_min": 20.0 }),
            action_template: ActionTemplate {
                action_label: "Investigate expense".to_string(),
                description: "A recurring expense has increased by 20% or more compared to the \
                              previous period. Investigate before it becomes a budget problem."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.82,
            enabled: true,
        },
        // FIN-06: Client payment delayed beyond baseline
        ProactiveHeuristic {
            id: "fin-client-payment-overdue".to_string(),
            name: "Client Payment Overdue".to_string(),
            trigger_event_type: "finance_event".to_string(),
            conditions: json!({ "event_subtype": "payment_delay", "days_overdue_min": 7 }),
            action_template: ActionTemplate {
                action_label: "Prepare collection workflow".to_string(),
                description: "A client payment is 7 or more days past the expected date. \
                              Send a polite follow-up or escalate to a collection process."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.87,
            enabled: true,
        },
        // FIN-07: Quarterly BAS due
        ProactiveHeuristic {
            id: "fin-bas-due".to_string(),
            name: "Quarterly BAS Due".to_string(),
            trigger_event_type: "finance_event".to_string(),
            conditions: json!({ "event_subtype": "bas_due", "days_until_due_max": 21 }),
            action_template: ActionTemplate {
                action_label: "Start BAS preparation".to_string(),
                description: "Your quarterly Business Activity Statement is due within 21 days. \
                              Start reconciling GST records to avoid a rushed lodgement."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.88,
            enabled: true,
        },
        // FIN-08: Subscription unused for 90 days
        ProactiveHeuristic {
            id: "fin-unused-subscription".to_string(),
            name: "Subscription Unused 90 Days".to_string(),
            trigger_event_type: "finance_event".to_string(),
            conditions: json!({ "event_subtype": "subscription_inactive", "days_inactive_min": 90 }),
            action_template: ActionTemplate {
                action_label: "Cancel or review".to_string(),
                description: "A paid subscription hasn't been used in 90 days. \
                              Cancel it to recover the cost or consciously choose to keep it."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.78,
            enabled: true,
        },
        // FIN-09: Multiple large expenses cluster — liquidity risk
        ProactiveHeuristic {
            id: "fin-liquidity-cluster".to_string(),
            name: "Large Expense Cluster — Liquidity Risk".to_string(),
            trigger_event_type: "finance_event".to_string(),
            conditions: json!({ "event_subtype": "expense_cluster", "cluster_count_min": 3, "days_window": 14 }),
            action_template: ActionTemplate {
                action_label: "Review cash position".to_string(),
                description: "Three or more large expenses are clustered in the next 14 days. \
                              Review your cash position to ensure liquidity."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // FIN-10: Insurance renewal near expiry
        ProactiveHeuristic {
            id: "fin-insurance-renewal".to_string(),
            name: "Insurance Policy Renewal Due".to_string(),
            trigger_event_type: "finance_event".to_string(),
            conditions: json!({ "event_subtype": "insurance_renewal", "days_until_expiry_max": 30 }),
            action_template: ActionTemplate {
                action_label: "Compare and renew".to_string(),
                description: "An insurance policy is expiring within 30 days. \
                              Compare market alternatives before auto-renewing at the old rate."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
    ]
}

// ── Note & Knowledge Pack ─────────────────────────────────────────────────────

pub fn note_knowledge_heuristics() -> Vec<ProactiveHeuristic> {
    vec![
        // NK-01: Note created during meeting containing "todo" or "action"
        ProactiveHeuristic {
            id: "nk-meeting-note-action".to_string(),
            name: "Action Item in Meeting Note".to_string(),
            trigger_event_type: "note_created".to_string(),
            conditions: json!({ "created_during_meeting": true, "contains_action_keyword": true }),
            action_template: ActionTemplate {
                action_label: "Extract to task manager".to_string(),
                description: "A note was taken during a meeting and contains action items. \
                              Extract them into your task manager before they get buried."
                    .to_string(),
                urgency: "important".to_string(),
            },
            confidence_threshold: 0.85,
            enabled: true,
        },
        // NK-02: Large unstructured note — suggest formatting/tagging
        ProactiveHeuristic {
            id: "nk-unstructured-dump".to_string(),
            name: "Unstructured Note Dump".to_string(),
            trigger_event_type: "note_created".to_string(),
            conditions: json!({ "word_count_min": 300, "is_structured": false }),
            action_template: ActionTemplate {
                action_label: "Auto-format and tag".to_string(),
                description: "A large unstructured note has been saved. Formatting and tagging \
                              it now will make it searchable and useful later."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // NK-03: New note shares concepts with older notes — suggest linking
        ProactiveHeuristic {
            id: "nk-zettelkasten-link".to_string(),
            name: "Related Notes — Suggest Linking".to_string(),
            trigger_event_type: "note_created".to_string(),
            conditions: json!({ "related_note_count_min": 2 }),
            action_template: ActionTemplate {
                action_label: "Link related notes".to_string(),
                description: "This note shares concepts with 2 or more existing notes. \
                              Linking them creates a connected knowledge graph that surfaces \
                              insights automatically."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.72,
            enabled: true,
        },
        // NK-04: Note titled "Idea" left untouched for 7 days
        ProactiveHeuristic {
            id: "nk-idea-note-stale".to_string(),
            name: "Idea Note Untouched 7 Days".to_string(),
            trigger_event_type: "note_created".to_string(),
            conditions: json!({ "title_pattern": "idea", "days_since_update_min": 7 }),
            action_template: ActionTemplate {
                action_label: "Archive or expand".to_string(),
                description: "An idea note hasn't been touched in 7 days. \
                              Decide whether to develop it into something actionable or \
                              archive it to clear mental space."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.70,
            enabled: true,
        },
        // NK-05: Unread "Read Later" queue exceeds 20 items
        ProactiveHeuristic {
            id: "nk-read-later-overload".to_string(),
            name: "Read-Later Queue Overloaded".to_string(),
            trigger_event_type: "note_created".to_string(),
            conditions: json!({ "read_later_queue_size_min": 20 }),
            action_template: ActionTemplate {
                action_label: "Compress oldest articles".to_string(),
                description: "Your Read-Later queue has 20 or more items. \
                              Compress the oldest 5 into a quick summary so you can clear \
                              the backlog without losing value."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.72,
            enabled: true,
        },
        // NK-06: Duplicate notes detected with slight variations
        ProactiveHeuristic {
            id: "nk-duplicate-notes".to_string(),
            name: "Duplicate Notes Detected".to_string(),
            trigger_event_type: "note_created".to_string(),
            conditions: json!({ "similarity_score_min": 0.85, "duplicate_candidate_count_min": 1 }),
            action_template: ActionTemplate {
                action_label: "Merge and version".to_string(),
                description: "One or more near-duplicate notes have been detected. \
                              Merge them into a single canonical version to keep your \
                              knowledge base clean."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.78,
            enabled: true,
        },
        // NK-07: Daily journal sentiment consistently low
        ProactiveHeuristic {
            id: "nk-journal-low-sentiment".to_string(),
            name: "Consistent Low-Sentiment Journal".to_string(),
            trigger_event_type: "note_created".to_string(),
            conditions: json!({ "note_subtype": "journal", "rolling_sentiment_max": -0.3, "window_days": 5 }),
            action_template: ActionTemplate {
                action_label: "Review workload and stressors".to_string(),
                description: "Your journal entries have been consistently low in sentiment \
                              over the past 5 days. This may indicate rising stress — \
                              consider reviewing your current workload."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.75,
            enabled: true,
        },
        // NK-08: Note references a specific person frequently — suggest entity link
        ProactiveHeuristic {
            id: "nk-entity-link-suggest".to_string(),
            name: "Frequent Person Reference — Suggest Entity".to_string(),
            trigger_event_type: "note_created".to_string(),
            conditions: json!({ "person_mention_count_min": 5, "entity_linked": false }),
            action_template: ActionTemplate {
                action_label: "Create entity link".to_string(),
                description: "This person is mentioned frequently in your notes but has no \
                              entity profile yet. Creating one will connect all related \
                              context automatically."
                    .to_string(),
                urgency: "gentle".to_string(),
            },
            confidence_threshold: 0.72,
            enabled: true,
        },
    ]
}

// ── Combined pack loader ──────────────────────────────────────────────────────

/// Returns all life-care heuristics across all packs.
/// The watcher runtime filters these by enabled pack IDs from the user's policy.
pub fn all_watcher_heuristics() -> Vec<ProactiveHeuristic> {
    let mut all = Vec::new();
    all.extend(allergy_heuristics());
    all.extend(medication_heuristics());
    all.extend(shopping_heuristics());
    all.extend(nutrition_heuristics());
    all.extend(study_heuristics());
    all.extend(household_heuristics());
    all.extend(schedule_heuristics());
    all.extend(email_triage_heuristics());
    all.extend(calendar_events_heuristics());
    all.extend(weather_events_heuristics());
    all.extend(traffic_events_heuristics());
    all.extend(news_events_heuristics());
    all.extend(task_todo_heuristics());
    all.extend(goal_tracking_heuristics());
    all.extend(meeting_heuristics());
    all.extend(deadline_heuristics());
    all.extend(finance_heuristics());
    all.extend(note_knowledge_heuristics());
    all
}

/// Returns only heuristics belonging to the given pack IDs.
/// An empty `enabled_packs` list returns ALL heuristics.
pub fn heuristics_for_packs(enabled_packs: &[&str]) -> Vec<ProactiveHeuristic> {
    if enabled_packs.is_empty() {
        return all_watcher_heuristics();
    }

    let pack_map: HashMap<&str, Vec<ProactiveHeuristic>> = [
        ("allergy", allergy_heuristics()),
        ("medication", medication_heuristics()),
        ("shopping", shopping_heuristics()),
        ("nutrition", nutrition_heuristics()),
        ("study", study_heuristics()),
        ("household", household_heuristics()),
        ("schedule", schedule_heuristics()),
        ("email_triage", email_triage_heuristics()),
        ("calendar_events", calendar_events_heuristics()),
        ("weather_events", weather_events_heuristics()),
        ("traffic_events", traffic_events_heuristics()),
        ("news_events", news_events_heuristics()),
        ("task_todo", task_todo_heuristics()),
        ("goal_tracking", goal_tracking_heuristics()),
        ("meeting", meeting_heuristics()),
        ("deadline", deadline_heuristics()),
        ("finance", finance_heuristics()),
        ("note_knowledge", note_knowledge_heuristics()),
    ]
    .into_iter()
    .collect();

    enabled_packs
        .iter()
        .filter_map(|pack| pack_map.get(pack))
        .flat_map(|h| h.iter().cloned())
        .collect()
}

// ── Pre-compiled conditions ───────────────────────────────────────────────────

/// A condition pre-parsed from `ProactiveHeuristic.conditions` at index-build
/// time. Replaces per-call `str::strip_suffix` with a fast enum dispatch.
#[derive(Debug, Clone)]
enum CompiledCondition {
    /// `metadata[key] == expected` (exact equality)
    Exact { key: String, expected: Value },
    /// `metadata[key] >= threshold`  (key suffix `_min` at parse time)
    Min { key: String, threshold: f64 },
    /// `metadata[key] <= threshold`  (key suffix `_max` at parse time)
    Max { key: String, threshold: f64 },
    /// `metadata["idle_hours"] >= threshold`  (legacy alias, kept for backwards compat)
    LegacyIdleHours { threshold: f64 },
}

fn compile_conditions(conditions: &Value) -> Vec<CompiledCondition> {
    let Some(map) = conditions.as_object() else {
        return Vec::new();
    };
    map.iter()
        .map(|(key, value)| {
            if key == "idle_hours_threshold" {
                CompiledCondition::LegacyIdleHours {
                    threshold: value.as_f64().unwrap_or(0.0),
                }
            } else if let Some(base) = key.strip_suffix("_min") {
                CompiledCondition::Min {
                    key: base.to_string(),
                    threshold: value.as_f64().unwrap_or(0.0),
                }
            } else if let Some(base) = key.strip_suffix("_max") {
                CompiledCondition::Max {
                    key: base.to_string(),
                    threshold: value.as_f64().unwrap_or(f64::MAX),
                }
            } else {
                CompiledCondition::Exact {
                    key: key.clone(),
                    expected: value.clone(),
                }
            }
        })
        .collect()
}

fn eval_compiled(compiled: &[CompiledCondition], metadata: &Value) -> bool {
    for cond in compiled {
        let ok = match cond {
            CompiledCondition::Exact { key, expected } => {
                metadata.get(key.as_str()).map_or(false, |v| v == expected)
            }
            CompiledCondition::Min { key, threshold } => {
                metadata
                    .get(key.as_str())
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0)
                    >= *threshold
            }
            CompiledCondition::Max { key, threshold } => {
                metadata
                    .get(key.as_str())
                    .and_then(Value::as_f64)
                    .unwrap_or(f64::MAX)
                    <= *threshold
            }
            CompiledCondition::LegacyIdleHours { threshold } => {
                metadata
                    .get("idle_hours")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0)
                    >= *threshold
            }
        };
        if !ok {
            return false;
        }
    }
    true
}

// ── Compiled heuristic wrapper ────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct CompiledHeuristic {
    source: ProactiveHeuristic,
    compiled: Vec<CompiledCondition>,
}

impl CompiledHeuristic {
    fn new(h: ProactiveHeuristic) -> Self {
        let compiled = compile_conditions(&h.conditions);
        Self {
            source: h,
            compiled,
        }
    }
}

// ── Inverted-index heuristic lookup ──────────────────────────────────────────

/// Inverted index of watcher heuristics keyed by `trigger_event_type`.
///
/// Building this once at startup (or on pack-change) instead of scanning a
/// flat `Vec<ProactiveHeuristic>` on every event delivers two scale wins:
///
/// 1. **O(1) dispatch** — only heuristics whose trigger type matches the
///    incoming event subtype are ever visited.
/// 2. **Zero-parse condition evaluation** — `_min`/`_max` key parsing is done
///    once at build time; the hot path does only enum-match arithmetic.
///
/// A Bloom filter or per-bucket decision tree would add another layer for
/// buckets with thousands of heuristics. At current scale (≤ 9 per bucket)
/// the inverted index alone is sufficient; add them if a bucket grows past
/// ~50 rules and profiling shows condition evaluation as the bottleneck.
pub struct WatcherHeuristicIndex {
    index: HashMap<String, Vec<CompiledHeuristic>>,
    total: usize,
}

impl WatcherHeuristicIndex {
    /// Build the index from a flat heuristic list.
    /// Disabled heuristics are excluded; enabled ones are compiled and bucketed.
    pub fn build(heuristics: Vec<ProactiveHeuristic>) -> Self {
        let mut index: HashMap<String, Vec<CompiledHeuristic>> = HashMap::new();
        let mut total = 0usize;
        for h in heuristics {
            if !h.enabled {
                continue;
            }
            total += 1;
            index
                .entry(h.trigger_event_type.clone())
                .or_default()
                .push(CompiledHeuristic::new(h));
        }
        Self { index, total }
    }

    /// Total number of enabled heuristics across all event-type buckets.
    pub fn heuristic_count(&self) -> usize {
        self.total
    }

    /// Number of heuristics in a specific event-type bucket.
    /// Zero means this event type has no rules; `evaluate` returns immediately.
    pub fn bucket_len(&self, event_subtype: &str) -> usize {
        self.index.get(event_subtype).map_or(0, Vec::len)
    }

    /// Evaluate all heuristics that match `event_subtype` against `event`.
    ///
    /// O(1) bucket lookup; O(k) condition evaluation where k = bucket size.
    /// No string parsing — all conditions are pre-compiled enum variants.
    pub fn evaluate(
        &self,
        event: &AfpPassiveEventContent,
        event_subtype: &str,
    ) -> Vec<EvaluationResult> {
        let Some(bucket) = self.index.get(event_subtype) else {
            return Vec::new();
        };

        let mut results = Vec::new();
        for ch in bucket {
            if event.confidence < ch.source.confidence_threshold {
                continue;
            }
            if !eval_compiled(&ch.compiled, &event.metadata) {
                continue;
            }
            results.push(EvaluationResult {
                heuristic_id: ch.source.id.clone(),
                suggestion: AfpProactiveSuggestionContent {
                    heuristic_id: ch.source.id.clone(),
                    confidence: event.confidence,
                    urgency: ch.source.action_template.urgency.clone(),
                    action_label: ch.source.action_template.action_label.clone(),
                    description: ch.source.action_template.description.clone(),
                    action_afp_payload: None,
                    dismiss_reason: None,
                    source_event_id: None,
                    entity_id: event.entity_id.clone(),
                    ..Default::default()
                },
            });
        }
        results
    }
}

/// Build a `WatcherHeuristicIndex` for the given pack IDs.
/// An empty slice activates all packs.
pub fn build_watcher_index(enabled_packs: &[&str]) -> WatcherHeuristicIndex {
    WatcherHeuristicIndex::build(heuristics_for_packs(enabled_packs))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::AfpPassiveEventContent;
    use crate::proactive_engine::evaluate;
    use serde_json::json;

    fn life_event(
        source: &str,
        subtype: &str,
        metadata: serde_json::Value,
    ) -> (AfpPassiveEventContent, String) {
        (
            AfpPassiveEventContent {
                event_type: subtype.to_string(),
                payload: None,
                context: None,
                source: source.to_string(),
                entity_id: None,
                event_at: "2026-05-23T09:00:00Z".to_string(),
                confidence: 1.0,
                metadata,
            },
            subtype.to_string(),
        )
    }

    #[test]
    fn allergy_pack_has_correct_count() {
        assert_eq!(allergy_heuristics().len(), 4);
    }

    #[test]
    fn medication_pack_has_correct_count() {
        assert_eq!(medication_heuristics().len(), 6);
    }

    #[test]
    fn all_watcher_heuristics_covers_all_packs() {
        let all = all_watcher_heuristics();
        assert!(
            all.len() >= 50,
            "Expected at least 50 life-care heuristics across all packs"
        );
    }

    #[test]
    fn grapefruit_statin_fires_correctly() {
        let (event, subtype) = life_event(
            "shopping",
            "shopping_list_updated",
            json!({ "item_name_contains": "grapefruit", "on_statin": true }),
        );
        let results = evaluate(&event, &subtype, &allergy_heuristics());
        assert!(
            results
                .iter()
                .any(|r| r.heuristic_id == "allergy-grapefruit-statin")
        );
    }

    #[test]
    fn morning_medication_reminder_fires_when_not_taken() {
        let (event, subtype) = life_event(
            "medication_tracker",
            "medication_time",
            json!({ "dose_window": "morning", "not_taken": true }),
        );
        let results = evaluate(&event, &subtype, &medication_heuristics());
        assert!(
            results
                .iter()
                .any(|r| r.heuristic_id == "med-reminder-morning")
        );
    }

    #[test]
    fn medication_reminder_does_not_fire_when_already_taken() {
        let (event, subtype) = life_event(
            "medication_tracker",
            "medication_time",
            json!({ "dose_window": "morning", "not_taken": false }),
        );
        let results = evaluate(&event, &subtype, &medication_heuristics());
        assert!(
            !results
                .iter()
                .any(|r| r.heuristic_id == "med-reminder-morning")
        );
    }

    #[test]
    fn study_break_fires_after_25_minutes() {
        let (event, subtype) = life_event(
            "study_tracker",
            "study_session_started",
            // condition key is "session_duration_minutes_min": 25
            // → evaluator strips "_min" and looks up metadata["session_duration_minutes"] ≥ 25
            json!({ "session_duration_minutes": 30 }),
        );
        let results = evaluate(&event, &subtype, &study_heuristics());
        assert!(
            results
                .iter()
                .any(|r| r.heuristic_id == "study-pomodoro-break")
        );
    }

    #[test]
    fn heuristics_for_packs_filters_correctly() {
        let med_only = heuristics_for_packs(&["medication"]);
        assert!(med_only.iter().all(|h| h.id.starts_with("med-")));
        assert!(!med_only.iter().any(|h| h.id.starts_with("study-")));
    }

    #[test]
    fn heuristics_for_packs_empty_returns_all() {
        let all = heuristics_for_packs(&[]);
        assert_eq!(all.len(), all_watcher_heuristics().len());
    }

    // ── WatcherHeuristicIndex tests ───────────────────────────────────────────

    #[test]
    fn index_dispatches_only_matching_bucket() {
        let index = build_watcher_index(&[]);
        let event = AfpPassiveEventContent {
            event_type: "medication_time".to_string(),
            payload: None,
            context: None,
            source: "medication_tracker".to_string(),
            entity_id: None,
            event_at: "2026-05-23T09:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({ "dose_window": "morning", "not_taken": true }),
        };
        // medication_time bucket should fire; shopping events should not appear.
        let results = index.evaluate(&event, "medication_time");
        assert!(!results.is_empty());
        assert!(
            results
                .iter()
                .all(|r| r.heuristic_id.starts_with("med-")
                    || r.heuristic_id.starts_with("allergy-"))
        );
    }

    #[test]
    fn index_returns_empty_for_unknown_event_type() {
        let index = build_watcher_index(&[]);
        let event = AfpPassiveEventContent {
            event_type: "completely_unknown_subtype".to_string(),
            payload: None,
            context: None,
            source: "unknown".to_string(),
            entity_id: None,
            event_at: "2026-05-23T09:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({}),
        };
        assert!(
            index
                .evaluate(&event, "completely_unknown_subtype")
                .is_empty()
        );
    }

    #[test]
    fn index_compiled_min_condition_correct() {
        let index = build_watcher_index(&["study"]);
        // 30 minutes > 25 threshold → pomodoro fires; 20 minutes < 25 → does not.
        let make_event = |mins: i64| AfpPassiveEventContent {
            event_type: "study_session_started".to_string(),
            payload: None,
            context: None,
            source: "study".to_string(),
            entity_id: None,
            event_at: "2026-05-23T09:00:00Z".to_string(),
            confidence: 1.0,
            metadata: json!({ "session_duration_minutes": mins }),
        };
        assert!(
            index
                .evaluate(&make_event(30), "study_session_started")
                .iter()
                .any(|r| r.heuristic_id == "study-pomodoro-break")
        );
        assert!(
            !index
                .evaluate(&make_event(20), "study_session_started")
                .iter()
                .any(|r| r.heuristic_id == "study-pomodoro-break")
        );
    }

    #[test]
    fn index_bucket_len_reflects_pack_filter() {
        let all_index = build_watcher_index(&[]);
        let med_index = build_watcher_index(&["medication"]);
        // All-packs index has more rules in medication_time bucket (allergy pack adds one).
        assert!(all_index.bucket_len("medication_time") > med_index.bucket_len("medication_time"));
        // medication-only index has zero shopping rules.
        assert_eq!(med_index.bucket_len("shopping_list_updated"), 0);
    }

    #[test]
    fn index_heuristic_count_matches_flat_list() {
        let index = build_watcher_index(&[]);
        let flat = all_watcher_heuristics();
        let enabled_count = flat.iter().filter(|h| h.enabled).count();
        assert_eq!(index.heuristic_count(), enabled_count);
    }
}
