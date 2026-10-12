-- STaR: an optional name for an incident, given by the desk when it is created or later. The
-- incident_key stays the identity, the link (?i=<key>) and the scope of every train and note.
-- Additive: older clients ignore the column; null shows the key as before.

alter table star_incidents add column if not exists name text;

comment on column star_incidents.name is 'Optional desk-given incident name (max 60 characters in the app); null shows the key.';
