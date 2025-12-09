#!/bin/bash
# Setup .env.local for local development

cat > .env.local << 'ENVEOF'
# Database connection - pointing to shared postgres container
DATABASE_URL="postgresql://persano:Persano6636!@localhost:5432/trading_bot?schema=public"

# KuCoin API credentials (add your keys here if needed)
# KC_API_KEY="your_api_key"
# KC_API_SECRET="your_api_secret"
# KC_API_PASSPHRASE="your_passphrase"
# KC_SANDBOX=false

# OANDA API credentials (optional)
# OANDA_API_KEY="your_oanda_api_key"
# OANDA_ACCOUNT_ID="your_oanda_account_id"
# OANDA_ENVIRONMENT="practice"

# Next.js
NODE_ENV=development
ENVEOF

echo "✅ Created .env.local file for local development"
echo "📝 Edit .env.local to add your API keys if needed"
