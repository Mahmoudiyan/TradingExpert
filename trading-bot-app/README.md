# Trading Bot Manager

A full-stack Next.js application for managing a KuCoin trading bot with a web dashboard.

## Features

- 🤖 Automated trading bot with Moving Average crossover strategy
- 📊 Real-time dashboard with trading statistics
- ⚙️ Configurable trading parameters
- 📈 Trade history and performance tracking
- 📝 Activity logs and error monitoring
- 🐳 Docker support for easy deployment
- 💾 PostgreSQL database for data persistence

## Tech Stack

- **Frontend/Backend**: Next.js 14 (App Router) with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Trading API**: KuCoin Node.js SDK
- **Styling**: Tailwind CSS
- **Deployment**: Docker & Docker Compose

## Local Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL (or use Docker)
- KuCoin API keys

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env.local` file:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trading_bot?schema=public"
KC_API_KEY="your_api_key"
KC_API_SECRET="your_api_secret"
KC_API_PASSPHRASE="your_passphrase"
KC_SANDBOX=false
```

### 3. Set Up Database

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations (create tables)
npx prisma migrate dev --name init

# Or if using Colima PostgreSQL
npx prisma db push
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Docker Deployment

### 1. Build and Run with Docker Compose

```bash
# Create .env file for Docker
cp .env.local .env

# Build and start containers
docker compose up -d

# Run database migrations
docker compose exec app npx prisma migrate deploy
```

### 2. Access the Application

- App: http://localhost:3000
- Database: localhost:5432

### 3. Stop Containers

```bash
docker compose down
```

## Getting KuCoin API Keys

1. Log in to your KuCoin account
2. Go to API Management
3. Create a new API key
4. Set permissions: **Read** and **Trade** (NOT Withdraw)
5. Copy the API Key, Secret, and Passphrase
6. Add them to your `.env.local` file

**Important**: Start with sandbox mode (`KC_SANDBOX=true`) for testing!

## Usage

1. **Configure Bot**: Go to `/config` and set up your trading parameters
2. **Start Bot**: Click "Start Bot" on the dashboard
3. **Monitor**: View trades at `/trades` and logs at `/logs`
4. **Stop Bot**: Click "Stop Bot" when needed

## Default Settings

- **Strategy**: EMA 9/21 crossover
- **Timeframe**: 4 hours
- **Risk**: 1.5% per trade
- **Stop Loss**: 30 pips
- **Take Profit**: 75 pips (2.5:1 R/R)
- **Max Daily Loss**: 4%
- **Max Daily Profit**: 8%

## Project Structure

```
trading-bot-app/
├── app/
│   ├── api/          # API routes
│   ├── config/       # Configuration page
│   ├── trades/       # Trades page
│   ├── logs/         # Logs page
│   └── page.tsx      # Dashboard
├── lib/
│   ├── db.ts         # Database client
│   ├── kucoin.ts     # KuCoin API service
│   └── trading-bot.ts # Trading bot logic
├── prisma/
│   └── schema.prisma # Database schema
└── docker-compose.yml # Docker configuration
```

## Safety Features

- ✅ Risk management (position sizing)
- ✅ Daily loss/profit limits
- ✅ Spread filtering
- ✅ Trade logging
- ✅ Error handling

## License

MIT
