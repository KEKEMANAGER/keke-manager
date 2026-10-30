-- Mitsubishi Delica in the minivan list.
--
-- The vehicle form only offers the makes of the chosen type's category, and
-- "minivan" had no Mitsubishi, so a Delica driver could not pick his car
-- (one picked Toyota Granvia instead). Mitsubishi already exists as car,
-- suv and offroad; this adds it as minivan with the Delica models.

insert into public.vehicle_makes (name, category)
values ('Mitsubishi', 'minivan')
on conflict (name, category) do nothing;

insert into public.vehicle_models (make_id, name, body_type)
select mk.id, x.name, 'van'
from public.vehicle_makes mk
cross join (values ('Delica'), ('Delica D:5')) as x(name)
where mk.name = 'Mitsubishi' and mk.category = 'minivan'
on conflict (make_id, name) do nothing;
