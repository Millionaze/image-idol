-- 1. Add 'failed' to contact_status enum
ALTER TYPE contact_status ADD VALUE IF NOT EXISTS 'failed';