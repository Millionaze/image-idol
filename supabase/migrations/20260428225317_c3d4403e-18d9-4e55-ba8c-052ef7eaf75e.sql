UPDATE contacts
SET status = 'pending'
WHERE campaign_id = '4cd8e1e3-1499-416b-b0c7-1bdadc006098'
  AND status = 'bounced'
  AND sent_at IS NULL;

UPDATE campaigns
SET bounce_count = 0
WHERE id = '4cd8e1e3-1499-416b-b0c7-1bdadc006098';