# Discord Bot Project

## Overview
This is a feature-rich Discord bot built with Discord.js v14. The bot provides various functionalities including:
- Ticket system for user support
- Moderation tools (ban management, automod)
- Leveling system with XP tracking
- Fishing game system
- Voting system
- Giveaway management
- Achievement system
- Server statistics tracking

## Project Architecture

### Technology Stack
- **Runtime**: Node.js v20
- **Main Library**: discord.js v14.22.1
- **Database**: SQLite3 v5.1.7
- **Data Storage**: JSON files for various features

### File Structure
- `index.js` - Main bot file with all commands and event handlers (7477 lines)
- `bot.db` - SQLite database for tickets and bans
- `*.json` - Various JSON files for state management:
  - `counter.json` - Ticket and ban counters
  - `levels.json` - User leveling data
  - `settings.json` - Bot configuration
  - `tickets.json` - Active tickets
  - `votes.json` - Voting data
  - `fishing.json` - Fishing game data
  - `achievements.json` - User achievements
  - `serverSettings.json` - Per-server settings
  - `simulator.json` - Simulator data
  - `invites.json` - Invite tracking
  - `giveaway.js` - Giveaway configuration
  - `badwords.js` - Bad words filter list

### Database Schema
The SQLite database contains:
- `tickets` table - User support tickets with status tracking
- `bans` table - Ban records with timestamps and reasons

## Setup & Configuration

### Required Environment Variables
- `DISCORD_BOT_TOKEN` - Your Discord bot token from the Discord Developer Portal

### How to Get a Discord Bot Token
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select an existing one
3. Navigate to the "Bot" section
4. Click "Reset Token" or "Copy" to get your token
5. Add the token to Replit Secrets as `DISCORD_BOT_TOKEN`

### Bot Permissions
The bot requires the following intents (configured in code):
- All Gateway Intents (including privileged intents for full functionality)
- Message Content Intent
- Server Members Intent
- Presence Intent

## Running the Bot

The bot automatically starts via the configured workflow:
- **Command**: `npm start`
- **Entry Point**: `index.js`

The bot will:
1. Connect to Discord using the provided token
2. Initialize the SQLite database and create tables if needed
3. Load all JSON state files
4. Register slash commands
5. Set presence and activity status
6. Begin listening for events and commands

## Features Overview

### Commands & Features
- **Moderation**: Ban/unban, kick, timeout, automod with filters
- **Tickets**: Support ticket system with claiming and logging
- **Leveling**: XP-based leveling system with role rewards
- **Fishing**: Interactive fishing game with different fish rarities
- **Voting**: Create and manage polls/votes
- **Giveaways**: Host and manage giveaways
- **Achievements**: Track user achievements
- **Statistics**: Server member tracking and analytics

## Recent Changes

### 2025-11-02: Bug Fixes
- Fixed daily command - added missing `totalCoins` to return value in claimDaily function
- Verified all economy commands (daily, beg, crime, search) now return complete data structures

### 2025-11-02: Initial Replit Setup
- Removed hardcoded Discord bot token for security
- Configured to use `DISCORD_BOT_TOKEN` environment variable
- Added `npm start` script to package.json
- Created .gitignore to protect sensitive data (database, JSON files)
- Configured workflow for automatic bot startup
- Installed dependencies (discord.js, sqlite3)
- Verified bot successfully connects and runs

## User Preferences
None specified yet.

## Notes
- The bot uses JSON files for state persistence - these files are created automatically if they don't exist
- The SQLite database (`bot.db`) is created automatically on first run
- All sensitive data (tokens, database, state files) are excluded from version control via .gitignore
