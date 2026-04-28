-- Fix Dave's account: wrong username caused IMAP to log into the wrong mailbox
DELETE FROM public.inbox_messages WHERE account_id = '21538ce3-6f7d-4297-a329-18b6a8dc31dc';

UPDATE public.email_accounts
SET username = 'dave@millionaze.net',
    last_synced_uid = 0,
    password = ''
WHERE id = '21538ce3-6f7d-4297-a329-18b6a8dc31dc';