# Database Schema (LOCKED)

## Purpose

Defines what the Convex database stores for the bot.

---

## Core Tables

### 1. intentions

Purpose:
Store every interpreted customer message as a historical log.

Fields:

* user_id
* seller_id
* message_text
* message_function
* business_intent
* topic
* confidence
* ambiguity
* missing_information
* last_asked_key
* timestamp

Notes:

* this is a log table
* save every message here
* do NOT use this table directly as bot memory
* this is for analysis, debugging, and future learning

---

### 2. users

Purpose:
Store clean current memory for each customer.

Fields:

* user_id
* seller_id
* last_intent
* last_topic
* last_asked_key
* last_active_product_id
* preferred_brand
* preferred_model
* budget_range
* negotiation_tendency
* exchange_interest
* updated_at

Notes:

* this is the memory table
* only update when signal is clear enough
* do NOT overwrite with weak guesses
* this is the table the bot can use later for better continuity

---

## Design Principles

* Save every interpreted message in `intentions`
* Use `users` as filtered memory
* Keep schema structured and small
* Do not store random raw chat history as main memory
* Current message remains primary
* Database memory remains secondary

---

## Final Rule

`intentions` = history/log
`users` = clean active memory

The bot should learn from the database, but never blindly follow old data.
