-- Bring the sub-team colours into the brand palette on a database that has
-- already been seeded. Safe to run more than once; touches nothing else.
update "Team" set colour = '#a6a7a7' where key = 'OPS';
update "Team" set colour = '#f87624' where key = 'MECH';
update "Team" set colour = '#7d9ea3' where key = 'ELEC';
update "Team" set colour = '#9aa866' where key = 'ROBO';
update "Team" set colour = '#c08a9c' where key = 'SCI';
update "Team" set colour = '#9a8bbd' where key = 'SW';

select key, name, colour from "Team" order by position;
