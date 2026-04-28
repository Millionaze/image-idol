# Workflow & Pipeline UI

Builds the user-facing layer on top of the live workflow + pipeline backend. Three new pages, embedded managers, and updates to Campaigns + Contacts to integrate with the engine.

## Dependencies to add

- `@xyflow/react` — workflow canvas (React Flow v12)
- `@dnd-kit/core`, `@dnd-kit/sortable` — pipeline kanban drag-drop and stage reordering
- `dagre` — auto-layout for workflow graph on first load
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-mention`, `@tiptap/suggestion` — email body editor with merge tag autocomplete

(Prior prompt assumed these were installed; they are not. Confirmed via `package.json`.)

## Navigation changes

Add to `AppSidebar`:
- **Workflows** (`/workflows`) — `Workflow` icon
- **Pipeline** (`/pipeline`) — `LayoutList` icon

Routes registered in `src/App.tsx` under the protected `AppLayout`.

## Page 1 — `/workflows`

`src/pages/Workflows.tsx`

Layout: 300px left list + main canvas area.

**Left sidebar (`WorkflowList` component)**
- Search input + status filter (`draft`/`active`/`paused`/`archived`)
- "New workflow" button — inserts a row with default trigger node + entry point, selects it
- Rows: name, status badge, trigger-type icon, enrolled count (`stats.enrolled`), last run timestamp
- Click row → load into canvas

**Top bar (`WorkflowHeader`)**
- Inline-editable name
- Status toggle (Select: draft/active/paused)
- Save button (manual save; auto-save also runs every 10s while dirty)
- Delete button (AlertDialog confirm)
- Stats chips: enrolled / completed / exited from `workflows.stats`

**Canvas (`WorkflowCanvas` component)**

Built on `@xyflow/react`. Controlled state (`useNodesState`, `useEdgesState`). Custom node components per type:

| Node type | Component | Visual |
|---|---|---|
| `trigger` | `TriggerNode` | purple, `Zap` icon, one per workflow |
| `action` | `ActionNode` | coral, icon depends on action_type |
| `wait` | `WaitNode` | gray, `Timer` icon |
| `condition` | `ConditionNode` | blue, diamond, two output handles (true/false) |
| `split` | `SplitNode` | amber, `GitMerge`, N output handles |
| `goal` | `GoalNode` | green dashed border |
| `exit` | `ExitNode` | gray terminal |

Behavior:
- Drop from a handle onto empty canvas → opens **Action Picker modal**, then inserts the node and connects it.
- Click node → opens right-side **Config Panel** (Sheet) with form for that node type.
- Delete node → AlertDialog confirm if it has outgoing edges.
- Auto-layout via `dagre` on initial load only.
- Minimap + Controls overlay (built-in).
- Bezier edges (default).

Validation on save:
- Exactly one trigger node.
- Acyclic (DFS check).
- All non-exit leaves treated as implicit exits (allowed).

Persistence:
- Serialize `{ nodes, edges }` → `workflows.graph` JSONB.
- Trigger config separate → `workflows.trigger_config`.
- Auto-save (debounced 10s) while dirty.

**Action Picker modal (`ActionPickerDialog`)**

Categorized list (driven by `_shared/registries.ts` action types):
- Send: `send_email`, `send_sms`
- Update contact: `add_tag`, `remove_tag`, `set_custom_field`, `move_to_pipeline_stage`
- Flow control: `wait`, `condition`, `split`, `start_workflow`, `exit`
- Integrations: `fire_webhook`, `ai_classify_reply`

**Config Panels** (one component per node type, all rendered in a shared `NodeConfigSheet`):

- `TriggerConfig` — trigger type select; dynamic filters per trigger; global filters (tag include/exclude, pipeline stage, custom field match); re-enrollment radio.
- `SendEmailConfig` — from-account picker (from `email_accounts`), subject input with merge-tag autocomplete, TipTap body with `Mention` extension wired to merge tags + custom fields, "Use warmup rotation" checkbox.
- `AddTagConfig` / `RemoveTagConfig` — `TagPicker` (multiselect, create-inline).
- `SetCustomFieldConfig` — field picker (from `custom_field_definitions`), value input typed by `field_type`.
- `MoveToStageConfig` — pipeline picker → stage picker.
- `WaitConfig` — duration mode (days/hours/minutes) OR "wait until event" with event-type picker + timeout.
- `ConditionConfig` — rule rows (field, operator, value), all-of/any-of, editable true/false branch labels.
- `SplitConfig` — variants list (name, weight %) summing to 100, one outgoing handle per variant.
- `FireWebhookConfig` — endpoint picker (`webhook_endpoints` where `direction='outbound'`), JSON payload textarea.
- `AiClassifyReplyConfig` — prompt textarea, output custom-field picker.

## Page 2 — `/pipeline`

`src/pages/Pipeline.tsx`

**Top bar**
- Pipeline selector (Select from user's `pipelines`)
- "Manage pipelines" button → `PipelineEditorDialog`
- View toggle: Board / Table
- Tag filter (multiselect)

**Board view (`PipelineBoard`)**

Built with `@dnd-kit/core`:
- One column per `pipeline_stages` row, sorted by `position`. Header: color dot, name, contact count.
- Cards (`ContactCard`): name, email, tag pills, time-in-stage (relative), last activity.
- Drag card across columns → optimistic `setQueryData` update → `UPDATE contacts SET pipeline_stage_id = ...` (DB trigger handles history + event emission); on error revert + toast.
- Click card → opens `ContactDetailSheet`.
- Empty stage state.
- Pagination: load first 50 cards per stage, "Load more" button at bottom.

**Table view (`PipelineTable`)**

Data table with columns: Name, Email, Stage, Tags, dynamic custom-field columns (user toggles via column menu), Last activity, Time in stage. Filter/sort. Bulk actions menu: add tag, move to stage, start workflow.

On mobile (<768px), force table view.

**`PipelineEditorDialog`**
- List user's pipelines with edit/archive/delete.
- Edit mode: name input; sortable stage list (`@dnd-kit/sortable`) with name input, color picker, won/lost checkboxes, delete (confirm if `contacts` exist in stage); "Add stage" button.
- Save persists `pipeline_stages.position` via batched update.

If user has no pipelines on first load: backend already seeds Default via `seed_workflow_defaults_for_user` at signup, so just show whatever exists.

## Page 3 — Tag & Custom Field managers

Added under existing `/settings` page as new tabs (cleaner than separate routes).

**`TagManager` tab**
- List with name, color pill, usage count (`contact_tags` join count).
- Search.
- "New tag" → inline row with name input + `ColorPicker` (popover of preset swatches).
- Delete → AlertDialog (cascades remove from contacts).

**`CustomFieldManager` tab**
- Table: key, label, type, usage count (`contact_custom_values` count).
- "New field" dialog: label input → auto-generates snake_case key; type select (`text`, `number`, `date`, `boolean`, `select`, `url`); if `select`, options list editor.
- Delete confirms cascade.

**Reusable `TagPicker` component** — used by workflow configs and contact detail. Type-ahead search, multi-select, "Create new" inline.

**Reusable `ColorPicker` component** — popover with preset palette matching pipeline stage colors.

## Modifications to existing pages

**`/campaigns` (`src/pages/Campaigns.tsx`)**
- In campaign create/edit form, add: "Trigger workflow on campaign start?" checkbox.
- If checked, show workflow picker (filter `workflows` where `trigger_config->>'trigger_type' = 'campaign_started'` and status `active`).
- Store on the campaign row. (Backend already emits `campaign.started` events, so the engine handles enrollment automatically — no campaign-table schema change needed; the workflow's own trigger filters target the right campaign.)

**Contact detail (`ContactDetailSheet`, new shared component)**

Used by `/pipeline` (board + table), `/contacts`, and `/unibox`. Sections:
- Header: name, email, status.
- **Tags** — pill list with `TagPicker`.
- **Custom fields** — editable form generated from `custom_field_definitions`, persists to `contact_custom_values`.
- **Pipeline** — current stage chip; click to open stage picker; updates `contacts.pipeline_stage_id`.
- **Activity timeline** — last 50 rows from `events` for `contact_id`, newest first; renders icon + human label per `event_type`.
- **Start workflow** button — modal lists workflows with `trigger_type='manual_trigger'`; on confirm calls `event-emit` edge function with `manual.trigger` event for this contact.

Wire `/contacts` page rows to open this sheet on click.

## File map

```text
src/
  pages/
    Workflows.tsx                    new
    Pipeline.tsx                     new
    Settings.tsx                     edit (add Tags + Fields tabs)
    Campaigns.tsx                    edit (workflow toggle)
    Contacts.tsx                     edit (open ContactDetailSheet)
  components/
    workflows/
      WorkflowList.tsx
      WorkflowHeader.tsx
      WorkflowCanvas.tsx
      ActionPickerDialog.tsx
      NodeConfigSheet.tsx
      nodes/{Trigger,Action,Wait,Condition,Split,Goal,Exit}Node.tsx
      configs/{Trigger,SendEmail,AddTag,RemoveTag,SetCustomField,MoveToStage,Wait,Condition,Split,FireWebhook,AiClassifyReply,StartWorkflow}Config.tsx
      lib/{layout.ts,validate.ts,defaults.ts}
    pipeline/
      PipelineBoard.tsx
      PipelineTable.tsx
      PipelineEditorDialog.tsx
      ContactCard.tsx
    contacts/
      ContactDetailSheet.tsx
    shared/
      TagPicker.tsx
      ColorPicker.tsx
      MergeTagAutocomplete.tsx
      RichTextEditor.tsx        (TipTap + mention)
  AppSidebar.tsx                     edit (add nav items)
  App.tsx                            edit (register routes)
```

## Data access

All reads/writes use the browser `supabase` client with RLS. No new edge functions needed; the existing `event-emit` function is reused for manual workflow triggers.

Key queries (all React Query):
- `workflows` list, by-id, mutations
- `pipelines` + `pipeline_stages` (joined)
- `contacts` by stage (paginated 50)
- `tags`, `contact_tags`, `custom_field_definitions`, `contact_custom_values`
- `events` filtered by `contact_id` for timeline
- `email_accounts` for from-account picker
- `webhook_endpoints` for webhook config

## Validation rules

- Workflow graph: 1 trigger, acyclic (DFS), no orphan nodes (must be reachable from trigger).
- Split weights must sum to 100.
- Tag name unique per user (DB already enforces).
- Custom field key unique per user (DB already enforces); auto-derived from label.
- Pipeline stage delete blocked if contacts present (frontend confirm + DB will error if FK-referenced — handle with toast).

## Out of scope

Workflow analytics dashboard, bulk import from pipeline, advanced segmentation beyond tag/stage, workflow templates, any backend schema changes.
