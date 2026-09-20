-- Correct the sub-teams in place, without touching any task you have edited.
--
-- Brings an existing database in line with the structure document's six
-- sub-teams: Operations, Mechanical, Electronics, Robotics, Science, Software.
-- Safe to run more than once.
--
-- Paste into Supabase > SQL Editor and run.

begin;

-- Electrical is called Electronics.
update "Team" set name = 'Electronics' where key = 'ELEC';

-- Executive / Admin is not a sub-team. Its recruitment and administration work
-- belongs to Operations, so move everything across before removing it.
update "Task"
   set "teamId" = (select id from "Team" where key = 'OPS')
 where "teamId" in (select id from "Team" where key = 'EXEC');

update "Member"
   set "teamId" = (select id from "Team" where key = 'OPS')
 where "teamId" in (select id from "Team" where key = 'EXEC');

update "Workstream"
   set "teamId" = (select id from "Team" where key = 'OPS')
 where "teamId" in (select id from "Team" where key = 'EXEC');

-- Task keys keep their old prefix; rename them so EXEC-1 does not outlive the
-- team it was named after. Numbering continues after the highest OPS key.
with renumbered as (
  select t.id,
         row_number() over (order by t."boardOrder", t.key)
           + coalesce((select max(split_part(t2.key, '-', 2)::int)
                         from "Task" t2
                         join "Team" g2 on g2.id = t2."teamId"
                        where g2.key = 'OPS' and t2.key like 'OPS-%'), 0) as n
    from "Task" t
   where t.key like 'EXEC-%'
)
update "Task" t
   set key = 'OPS-' || r.n
  from renumbered r
 where t.id = r.id;

-- Drone and Mini-Rover are not sub-teams and own no work. Remove them, and the
-- now-empty Executive team, only once nothing references them.
delete from "Team"
 where key in ('EXEC', 'DRONE', 'MINI')
   and id not in (select "teamId" from "Task");

-- Put the remaining six in the order the interface should show them.
update "Team" set position = 0 where key = 'OPS';
update "Team" set position = 1 where key = 'MECH';
update "Team" set position = 2 where key = 'ELEC';
update "Team" set position = 3 where key = 'ROBO';
update "Team" set position = 4 where key = 'SCI';
update "Team" set position = 5 where key = 'SW';

commit;

select position, key, name from "Team" order by position;
