#!/bin/bash

# Configuration
SERVICE_NAME="ai-predict-pro-v11-stable"
REGION="us-west1"

echo "🔍 Fetching revisions for service: $SERVICE_NAME in region: $REGION..."

# Get all revisions sorted by creation time (newest first)
# We use --format="value(name)" to get just the revision names
REVISIONS=$(gcloud run revisions list --service "$SERVICE_NAME" --region "$REGION" --format="value(name)" --sort-by="~metadata.creationTimestamp")

if [ -z "$REVISIONS" ]; then
    echo "❌ No revisions found or error fetching revisions."
    exit 1
fi

# Convert newline-separated string to array
# (IFS handles the splitting by newline)
IFS=$'\n' read -rd '' -a REV_ARRAY <<<"$REVISIONS"

COUNT=${#REV_ARRAY[@]}
echo "📊 Found $COUNT total revisions."

if [ "$COUNT" -le 1 ]; then
    echo "✅ Only 1 revision exists. Nothing to clean up."
    exit 0
fi

# The first element is the latest because we sorted by ~metadata.creationTimestamp (descending)
LATEST=${REV_ARRAY[0]}
echo "🔒 Keeping latest revision: $LATEST"

echo "🗑️  Deleting $((COUNT - 1)) old revisions..."

# Loop through the rest and delete
for ((i=1; i<COUNT; i++)); do
    REV=${REV_ARRAY[i]}
    echo "   - Deleting $REV..."
    # --quiet skips confirmation, --async returns immediately so we don't wait for each
    gcloud run revisions delete "$REV" --region "$REGION" --quiet --async
done

echo "✨ Cleanup command issued for all old revisions."
