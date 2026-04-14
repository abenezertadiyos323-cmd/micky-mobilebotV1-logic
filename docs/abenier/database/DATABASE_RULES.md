# Database Rules (LOCKED)

## Purpose

Defines how database information is saved and used.

---

## Rule 1 — Save Every Interpreted Message

Every interpreted customer message should be saved to the `intentions` table.

Save:

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

Important:

* save every message here
* this is a historical log
* this is not direct bot memory

---

## Rule 2 — Update User Memory Only When Clear

Update the `users` table only when the signal is strong enough.

Examples of good update signals:

* clear product interest
* clear pricing intent
* clear exchange interest
* clear preference
* clear asked field

Examples of weak signals:

* noisy short message
* unclear meaning
* high ambiguity
* low confidence

Important:

* do not overwrite memory with weak guesses
* memory must stay stable

---

## Rule 3 — Current Message First

The current natural message is always the primary source of meaning.

Database memory is secondary.

Important:

* do not force old memory onto a new message
* only use stored memory when it clearly fits the current message

---

## Rule 4 — Database Supports Decision, Not Meaning

The database must support:

* continuity
* personalization
* remembering preferences
* remembering last clear state

The database must NOT:

* replace current message understanding
* force intention
* invent context

---

## Rule 5 — Use Confidence Carefully

High confidence + low ambiguity:

* may update user memory

Low confidence or high ambiguity:

* save only to `intentions`
* do not strongly update `users`

---

## Rule 6 — Keep Memory Small and Useful

Store only useful structured signals.

Good memory:

* last_intent
* last_topic
* last_asked_key
* preferred_brand
* budget_range
* negotiation_tendency

Do not treat raw full chat history as main memory.

---

## Final Rule

`intentions` = full history
`users` = filtered memory

The bot should use the database to support better decisions, but never blindly follow old stored data.
