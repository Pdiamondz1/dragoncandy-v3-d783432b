-- Migration: Make customer fields nullable for simplified CGC submission flow
-- Spec ref: Section 3.2, Section 4.3 Migration 1

ALTER TABLE promotion_submissions
  ALTER COLUMN customer_name DROP NOT NULL;

ALTER TABLE promotion_submissions
  ALTER COLUMN customer_phone DROP NOT NULL;

ALTER TABLE discount_codes
  ALTER COLUMN customer_phone DROP NOT NULL;
