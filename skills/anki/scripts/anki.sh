#!/usr/bin/env bash
set -euo pipefail

ANKI_URL="${ANKI_URL:-http://localhost:8765}"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required dependency: $1" >&2
    exit 1
  }
}

invoke() {
  local action="$1"
  local params="${2:-"{}"}"
  local body
  body=$(jq -n --arg a "$action" --argjson p "$params" '{action:$a,version:6,params:$p}')
  curl -fsS "$ANKI_URL" -d "$body" | jq 'if .error != null then error(.error) else .result end'
}

cmd_sync() { invoke sync; }

cmd_decks() {
  local decks
  decks=$(invoke deckNamesAndIds)
  if [[ "${1:-}" != "--stats" ]]; then
    echo "$decks"
    return
  fi
  echo "$decks" | jq -rc 'to_entries[]' | while IFS= read -r e; do
    local deck id esc total due
    deck=$(echo "$e" | jq -r '.key')
    id=$(echo "$e" | jq '.value')
    esc="${deck//\"/\\\"}"
    total=$(invoke findCards "{\"query\":$(jq -n --arg q "deck:\"$esc\"" '$q')}" | jq 'length')
    due=$(invoke findCards "{\"query\":$(jq -n --arg q "is:due deck:\"$esc\"" '$q')}" | jq 'length')
    jq -n --arg d "$deck" --argjson i "$id" --argjson t "$total" --argjson u "$due" \
      '{name:$d,id:$i,total:$t,due:$u}'
  done | jq -s '.'
}

cmd_models() { invoke modelNames; }

cmd_fields() {
  [[ $# -lt 1 ]] && { echo "Usage: anki.sh fields <model>" >&2; exit 1; }
  invoke modelFieldNames "$(jq -n --arg m "$1" '{modelName:$m}')"
}

cmd_find() {
  [[ $# -lt 1 ]] && { echo "Usage: anki.sh find <query>" >&2; exit 1; }
  local query="$1"
  invoke findNotes "{\"query\":$(jq -n --arg q "$query" '$q')}"
}

cmd_info() {
  [[ $# -lt 1 ]] && { echo "Usage: anki.sh info <id> [id...]" >&2; exit 1; }
  local ids
  ids=$(printf '%s\n' "$@" | jq -nR '[inputs | tonumber]')
  invoke notesInfo "{\"notes\":$ids}"
}

cmd_add() {
  local tags=""
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tags) tags="$2"; shift 2 ;;
      *) args+=("$1"); shift ;;
    esac
  done
  [[ ${#args[@]} -lt 3 ]] && { echo "Usage: anki.sh add <deck> <model> <json-fields> [--tags \"t1 t2\"]" >&2; exit 1; }
  local deck="${args[0]}" model="${args[1]}" fields="${args[2]}"
  local tag_arr="[]"
  [[ -n "$tags" ]] && tag_arr=$(echo "$tags" | tr ' ' '\n' | jq -nR '[inputs | select(length > 0)]')
  local params
  params=$(jq -n --arg d "$deck" --arg m "$model" --argjson f "$fields" --argjson t "$tag_arr" \
    '{note:{deckName:$d,modelName:$m,fields:$f,tags:$t}}')
  invoke addNote "$params"
}

cmd_add_bulk() {
  local tags=""
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tags) tags="$2"; shift 2 ;;
      *) args+=("$1"); shift ;;
    esac
  done
  [[ ${#args[@]} -lt 3 ]] && { echo "Usage: anki.sh add-bulk <deck> <model> <json-array> [--tags \"t1 t2\"]" >&2; exit 1; }
  local deck="${args[0]}" model="${args[1]}" arr="${args[2]}"
  local tag_arr="[]"
  [[ -n "$tags" ]] && tag_arr=$(echo "$tags" | tr ' ' '\n' | jq -nR '[inputs | select(length > 0)]')
  local params
  params=$(jq -n --arg d "$deck" --arg m "$model" --argjson a "$arr" --argjson t "$tag_arr" \
    '{notes: [$a[] | {deckName:$d, modelName:$m, fields:., tags:$t}]}')
  invoke addNotes "$params"
}

cmd_update() {
  [[ $# -lt 2 ]] && { echo "Usage: anki.sh update <id> <json-fields>" >&2; exit 1; }
  invoke updateNoteFields "$(jq -n --argjson id "$1" --argjson f "$2" '{note:{id:$id,fields:$f}}')"
}

cmd_delete() {
  [[ $# -lt 1 ]] && { echo "Usage: anki.sh delete <id> [id...]" >&2; exit 1; }
  local ids
  ids=$(printf '%s\n' "$@" | jq -nR '[inputs | tonumber]')
  invoke deleteNotes "{\"notes\":$ids}"
}

cmd_due() {
  local deck="" limit=10
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --limit) limit="$2"; shift 2 ;;
      *) deck="$1"; shift ;;
    esac
  done
  local query="is:due"
  if [[ -n "$deck" ]]; then
    local esc="${deck//\"/\\\"}"
    query="is:due deck:\"$esc\""
  fi
  local ids
  ids=$(invoke findCards "{\"query\":$(jq -n --arg q "$query" '$q')}")
  local arr
  arr=$(echo "$ids" | jq -c --argjson l "$limit" '.[:$l]')
  [[ "$arr" == "[]" ]] && { echo "[]"; return; }
  invoke cardsInfo "{\"cards\":$arr}"
}

cmd_review() {
  [[ $# -lt 1 ]] && { echo "Usage: anki.sh review <card-id>" >&2; exit 1; }
  invoke cardsInfo "{\"cards\":[$1]}"
}

cmd_rate() {
  [[ $# -lt 2 ]] && { echo "Usage: anki.sh rate <card-id> <1-4>" >&2; exit 1; }
  [[ "$2" =~ ^[1-4]$ ]] || { echo "Rating must be 1, 2, 3, or 4" >&2; exit 1; }
  invoke answerCards "{\"answers\":[{\"cardId\":$1,\"ease\":$2}]}"
}

cmd_tags() {
  local tags
  tags=$(invoke getTags)
  if [[ "${1:-}" == "--pattern" && -n "${2:-}" ]]; then
    echo "$tags" | jq --arg p "$2" '[.[] | select(ascii_downcase | contains($p | ascii_downcase))]'
  else
    echo "$tags"
  fi
}

action="${1:-help}"
shift || true

require curl
require jq

case "$action" in
  sync)     cmd_sync ;;
  decks)    cmd_decks "$@" ;;
  models)   cmd_models ;;
  fields)   cmd_fields "$@" ;;
  find)     cmd_find "$@" ;;
  info)     cmd_info "$@" ;;
  add)      cmd_add "$@" ;;
  add-bulk) cmd_add_bulk "$@" ;;
  update)   cmd_update "$@" ;;
  delete)   cmd_delete "$@" ;;
  due)      cmd_due "$@" ;;
  review)   cmd_review "$@" ;;
  rate)     cmd_rate "$@" ;;
  tags)     cmd_tags "$@" ;;
  *)
    cat >&2 <<'EOF'
Usage: anki.sh <action> [args...]

Actions:
  sync                                          Trigger AnkiWeb sync
  decks [--stats]                               List decks
  models                                        List note types
  fields <model>                                List fields for a model
  find <query>                                  Search notes (Anki query syntax)
  info <id> [id...]                             Get note details
  add <deck> <model> <json-fields> [--tags ..]  Add a note
  add-bulk <deck> <model> <json-array> [--tags] Add multiple notes
  update <id> <json-fields>                     Update note fields
  delete <id> [id...]                           Delete notes
  due [deck] [--limit N]                        Get due cards
  review <card-id>                              Show card for review
  rate <card-id> <1-4>                          Rate a card
  tags [--pattern str]                          List tags
EOF
    exit 1
    ;;
esac
