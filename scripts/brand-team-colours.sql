-- Sub-team colours from the Mission Control palette document. Run against a
-- database that is already seeded; safe to run more than once and touches
-- nothing but the colour column.
update "Team" set colour = '#8b9aaf' where key = 'OPS';   -- slate blue
update "Team" set colour = '#f87624' where key = 'MECH';  -- MarsWorks orange
update "Team" set colour = '#35b9d6' where key = 'ELEC';  -- cyan
update "Team" set colour = '#8bcb3f' where key = 'ROBO';  -- green
update "Team" set colour = '#d96baa' where key = 'SCI';   -- pink
update "Team" set colour = '#9b72e8' where key = 'SW';    -- purple

select key, name, colour from "Team" order by position;
