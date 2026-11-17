-- La app arma OP con cc.proxima_op (reserva el número en cc.reservas_op) y
-- cc.cargar_pagos, que al grabar la OP borra su reserva. Sin DELETE sobre esa tabla
-- cargar_pagos falla con "permission denied for table reservas_op" y no se graba nada.
-- Es la única tabla de cc donde la app borra: una reserva es un número apartado, no un dato.
-- Se aplica con el dueño de la base. En la rama dev-app-compras ya está aplicado (17/11).

grant delete on cc.reservas_op to app_compras;
