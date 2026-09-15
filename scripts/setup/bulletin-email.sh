#!/usr/bin/env bash
#
# Sets up Bulletin email (Step 8 of docs/guides/self-hosting.md) with the
# Resend CLI, so the only hands-on work left is pasting DNS records at your
# registrar. Re-runnable: it remembers what it already did.
#
# Run from the repo root, after `npx convex dev` has linked this checkout to
# your Convex project:
#
#   bash scripts/setup/bulletin-email.sh
#
# Everything above the "STAGES" marker is the wizard library: do not hand-edit
# it. Author the per-step stages below the marker.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Wizard library: delightful, consistent UX, identical across every wizard.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

# Author sets this at the top of the stages section.
TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()    # KEYs written to ENV_FILE this run
WRITTEN_SECRET=() # secret NAMEs set this run
SKIPPED=()        # things we couldn't do (e.g. gh missing)

# _clear wipes the terminal so only the current step is on screen. No-op when
# output isn't a terminal, so piped logs stay readable.
_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

# banner "Title" shows the opening frame: what this wizard does.
banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later, since it remembers values already saved.%s\n' "$RESET"
  pause "Ready to start?"
}

# stage "Name" clears the screen, then announces a stage and shows progress.
# Clearing keeps only the current step on screen.
stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

# say "..." prints a plain instruction line.
say()  { printf '  %s\n' "$1"; }
# step "..." is a numbered-feeling action the human takes in the browser.
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

# open_url URL opens it in the human's browser, cross-platform incl. WSL.
open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else warn "couldn't open a browser; visit it manually: $url"; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser, so visit it manually: $url"
}

# pause "msg" waits for the human to confirm they've done the manual part.
pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

# confirm "question" is a y/N gate; returns success on yes.
confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

# _existing KEY: current value of KEY in ENV_FILE, if any.
_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

# ask KEY "Prompt" reads a value into $KEY. Offers the existing .env value as
# a default on re-runs (Enter keeps it). Visible input (non-secret).
ask() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -r input || true
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# ask_secret KEY "Prompt" is like ask, but input is hidden.
ask_secret() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || true
  printf '\n'
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# write_env KEY VALUE upserts KEY=VALUE into ENV_FILE (creates it; replaces
# any existing line). Idempotent.
write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

# set_secret NAME VALUE sets a GitHub Actions repo secret via gh. Falls back
# to a warning (and records it) if gh is unavailable or unauthenticated.
set_secret() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
      WRITTEN_SECRET+=("$name")
      printf '  %s✓ set%s GitHub secret %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub secret $name (set it manually: gh secret set $name)")
  warn "skipped GitHub secret $name: gh not ready; set it later"
}

# set_var NAME VALUE sets a GitHub Actions repo variable (non-secret).
set_var() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if gh variable set "$name" --body "$value" >/dev/null 2>&1; then
      printf '  %s✓ set%s GitHub variable %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub variable $name")
  warn "skipped GitHub variable $name, gh not ready; set it later"
}

# finish clears, then shows a closing summary of everything configured.
finish() {
  _clear
  printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} ))    && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
  (( ${#WRITTEN_SECRET[@]} )) && note "set ${#WRITTEN_SECRET[@]} GitHub secret(s): ${WRITTEN_SECRET[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "still to do by hand:"
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES: author this section. One stage() per step the human takes.
# ──────────────────────────────────────────────────────────────────────────

# Values remembered between runs live in a gitignored scratch file, never in
# the repo. The Resend admin key is the one exception: it is asked for every
# run and kept only in memory.
ENV_FILE=".env.bulletin-email.local"

# Which Convex deployment to configure. Production by default; set
# CONVEX_TARGET="--preview-name my-branch" to configure a preview instead.
CONVEX_TARGET="${CONVEX_TARGET:---prod}"

# Pinned to the CLI's current major so the flags below keep meaning what
# they mean here.
RESEND_CLI="npx -y resend-cli@2"

# resend ARGS...: the Resend CLI, authenticated with this run's admin key,
# always in JSON so the output can be parsed.
resend() { RESEND_API_KEY="$RESEND_ADMIN_KEY" $RESEND_CLI "$@" --json; }

# json EXPR: evaluate a JS expression against JSON on stdin (bound to `d`).
# node is guaranteed here; jq is not.
json() {
  node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const d=JSON.parse(s);const r=eval(process.argv[1]);process.stdout.write(r==null?"":String(r))})' "$1"
}

# convex_set NAME VALUE sets a Convex environment variable on the target
# deployment; the value never appears in the command line's echoed output.
convex_set() {
  local name="$1" value="$2"
  if npx convex env set "$name" "$value" $CONVEX_TARGET >/dev/null; then
    WRITTEN_SECRET+=("$name")
    printf '  %s✓ set%s Convex variable %s\n' "$GREEN" "$RESET" "$name"
  else
    SKIPPED+=("Convex variable $name (set it in the Convex dashboard under Settings → Environment Variables)")
    warn "could not set $name on Convex; set it in the dashboard later"
  fi
}

TOTAL_STAGES=7

banner "Bulletin email setup (Resend)"

# ── 1 ─────────────────────────────────────────────────────────────────────
stage "Check this computer is ready"
say "This needs Node.js, and this folder linked to your Convex project."
if ! command -v node >/dev/null 2>&1; then
  warn "Node.js is not installed. Install it from https://nodejs.org and re-run."; exit 1
fi
if ! npx convex env list $CONVEX_TARGET >/dev/null 2>&1; then
  warn "This folder is not linked to a Convex project yet (or you are not logged in)."
  say "Run 'npx convex dev' once from this folder (Step 2 of the self-hosting guide),"
  say "stop it with Ctrl-C, then re-run this wizard."
  exit 1
fi
say "Node.js and Convex are ready. Target deployment: ${CONVEX_TARGET#--}"
ask APP_BASE_URL "Address people open the app at (e.g. https://yourchoir.org):"
APP_BASE_URL="${APP_BASE_URL%/}"
if [[ ! "$APP_BASE_URL" =~ ^https://[^/]+$ ]]; then
  warn "That should look like https://yourchoir.org (https, no path, no trailing slash)."; exit 1
fi
write_env APP_BASE_URL "$APP_BASE_URL"

# ── 2 ─────────────────────────────────────────────────────────────────────
stage "Resend: an account and a key this wizard can use"
say "Resend is the service that delivers the mail. The wizard needs one key with"
say "full access so it can register your domain and webhook for you."
open_url "https://resend.com/api-keys"
step "Sign up or sign in if asked."
step "Click 'Create API Key'. Name: 'setup wizard'. Permission: 'Full access'. Click Add."
step "Copy the key that starts with re_ (it is shown only once)."
ask_secret RESEND_ADMIN_KEY "Paste the full-access key:"
if [[ ! "$RESEND_ADMIN_KEY" =~ ^re_ ]]; then warn "Resend keys start with re_. Re-run and paste the key."; exit 1; fi
if ! resend domains list >/dev/null 2>&1; then
  warn "Resend rejected that key. Check it was copied completely, then re-run."; exit 1
fi
say "Key accepted."
note "This key is not saved anywhere. You can delete it in Resend when the wizard is done."

# ── 3 ─────────────────────────────────────────────────────────────────────
stage "Your sending domain"
say "Mail will be sent from an address on a domain you own, e.g. yourchoir.org."
ask SEND_DOMAIN "Domain to send from:"
SEND_DOMAIN="${SEND_DOMAIN,,}"
if [[ ! "$SEND_DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]]; then warn "That does not look like a domain name."; exit 1; fi
write_env SEND_DOMAIN "$SEND_DOMAIN"
DOMAIN_ID=$(resend domains list --limit 100 | json "(Array.isArray(d)?d:(d.data||[])).filter(x=>x.name===\"$SEND_DOMAIN\").map(x=>x.id)[0]")
if [[ -n "$DOMAIN_ID" ]]; then
  say "Resend already knows $SEND_DOMAIN."
else
  ask SEND_REGION "Resend region closest to your choir (us-east-1, eu-west-1, sa-east-1, ap-northeast-1):"
  SEND_REGION="${SEND_REGION:-us-east-1}"
  write_env SEND_REGION "$SEND_REGION"
  DOMAIN_ID=$(resend domains create --name "$SEND_DOMAIN" --region "$SEND_REGION" | json 'd.id')
  say "Registered $SEND_DOMAIN with Resend."
fi
write_env DOMAIN_ID "$DOMAIN_ID"

# ── 4 ─────────────────────────────────────────────────────────────────────
stage "Add Resend's DNS records at your registrar"
say "These records prove to the world that Resend may send mail for $SEND_DOMAIN."
say "Add each one at the place you manage DNS for the domain (Cloudflare, Namecheap,"
say "GoDaddy, ...). Copy names and values exactly."
printf '\n'
resend domains get "$DOMAIN_ID" | json '
  (d.records||[]).map(r => `  ${String(r.record||"").padEnd(6)} ${String(r.type||"").padEnd(5)} name: ${r.name}\n${" ".repeat(14)}value: ${r.value}${r.priority!=null?`  (priority ${r.priority})`:""}`).join("\n\n")'
printf '\n\n'
note "If your registrar asks for a TTL, any value is fine. If it auto-appends your domain"
note "to the name, enter only the part before .$SEND_DOMAIN."
pause "Press Enter once the records are added."
say "Asking Resend to check them..."
resend domains verify "$DOMAIN_ID" >/dev/null 2>&1 || true
DOMAIN_STATUS=""
for _ in 1 2 3 4 5 6; do
  DOMAIN_STATUS=$(resend domains get "$DOMAIN_ID" | json 'd.status')
  [[ "$DOMAIN_STATUS" == "verified" ]] && break
  sleep 10
done
if [[ "$DOMAIN_STATUS" == "verified" ]]; then
  say "Verified. $SEND_DOMAIN can send mail."
else
  warn "Not verified yet (status: ${DOMAIN_STATUS:-unknown}). DNS changes can take up to an hour to show."
  say "The rest of the setup can finish now; mail will start working once Resend"
  say "shows the domain as verified. Re-run this wizard later to check."
  SKIPPED+=("Domain verification: check https://resend.com/domains until $SEND_DOMAIN shows Verified")
fi

# ── 5 ─────────────────────────────────────────────────────────────────────
stage "A send-only key for the app, and the From address"
say "The app gets its own key that can only send, and only from $SEND_DOMAIN."
SEND_KEY=$(resend api-keys create --name "ChoirManagement bulletins" --permission sending_access --domain-id "$DOMAIN_ID" | json 'd.token')
if [[ ! "$SEND_KEY" =~ ^re_ ]]; then warn "Resend did not return a key. Re-run this stage later."; exit 1; fi
say "Created."
ask CHOIR_NAME "Name to show as the sender (e.g. Sorrento Choir):"
write_env CHOIR_NAME "$CHOIR_NAME"
ask FROM_LOCAL "Mailbox part of the From address (Enter for 'bulletins'):"
FROM_LOCAL="${FROM_LOCAL:-bulletins}"
write_env FROM_LOCAL "$FROM_LOCAL"
FROM_EMAIL="$CHOIR_NAME <$FROM_LOCAL@$SEND_DOMAIN>"
say "Mail will come from: $FROM_EMAIL"
note "Replies to that address go nowhere unless you create the mailbox; that is normal for announcements."
convex_set RESEND_API_KEY "$SEND_KEY"
convex_set BULLETINS_FROM_EMAIL "$FROM_EMAIL"
convex_set APP_BASE_URL "$APP_BASE_URL"

# ── 6 ─────────────────────────────────────────────────────────────────────
stage "Let Resend report back whether mail arrived"
say "Resend will tell the app about deliveries and bounces, so the Email delivery"
say "panel on each Bulletin fills in by itself."
WEBHOOK_URL=$(npx convex run bulletinEmails:webhookEndpoint $CONVEX_TARGET 2>/dev/null | tr -d '"' || true)
if [[ ! "$WEBHOOK_URL" =~ ^https://.*\.convex\.site/resend-webhook$ ]]; then
  warn "Could not read the webhook address from Convex. Has the app been deployed with email support yet?"
  say "Deploy first (merge and let Vercel build), then re-run this wizard; it will pick up here."
  SKIPPED+=("Webhook: re-run the wizard after deploying")
  finish; exit 0
fi
say "Webhook address: $WEBHOOK_URL"
WEBHOOK_ID=$(resend webhooks list --limit 100 | json "(Array.isArray(d)?d:(d.data||[])).filter(x=>x.endpoint===\"$WEBHOOK_URL\").map(x=>x.id)[0]")
if [[ -n "$WEBHOOK_ID" ]]; then
  say "Resend already has this webhook."
  WEBHOOK_SECRET=$(resend webhooks get "$WEBHOOK_ID" | json 'd.signing_secret')
else
  WEBHOOK_JSON=$(resend webhooks create --endpoint "$WEBHOOK_URL" \
    --events email.sent,email.delivered,email.delivery_delayed,email.bounced,email.complained,email.failed)
  WEBHOOK_ID=$(printf '%s' "$WEBHOOK_JSON" | json 'd.id')
  WEBHOOK_SECRET=$(printf '%s' "$WEBHOOK_JSON" | json 'd.signing_secret')
  say "Registered."
fi
write_env WEBHOOK_ID "$WEBHOOK_ID"
if [[ "$WEBHOOK_SECRET" =~ ^whsec_ ]]; then
  convex_set RESEND_WEBHOOK_SECRET "$WEBHOOK_SECRET"
else
  warn "Resend did not return a signing secret."
  SKIPPED+=("RESEND_WEBHOOK_SECRET: copy it from https://resend.com/webhooks and set it in the Convex dashboard")
fi

# ── 7 ─────────────────────────────────────────────────────────────────────
stage "Send one and watch it arrive"
say "Everything is configured. To test it:"
step "Open $APP_BASE_URL and sign in as a Director or Admin."
step "Bulletins → Manage → create a test Bulletin (or open a published one)."
step "Tick 'Email this Bulletin to the roster' next to Publish, then publish."
step "Watch the 'Email delivery' panel: rows go from 'Handed to provider' to 'Delivered'."
note "A row still at 'Handed to provider' after 15 minutes means something is wrong:"
note "see 'If it does not work' in docs/guides/self-hosting.md Step 8."
say ""
say "You can now delete the 'setup wizard' key in Resend; the app uses its own send-only key."
pause "Press Enter to finish."

finish
