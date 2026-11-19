-- Cuenta separada de 5 proveedores cuyo cbu_alias en production es más nuevo que el de
-- dev (texto actualizado por transferencias de octubre y noviembre). sql/004 salió de los
-- textos viejos de dev y les dejaba CBU y titular vacíos. Va después de 004.
-- Extraído con separarCuenta (src/lib/proveedores/cuenta.ts). cbu_alias no se toca.
-- Aplicado en production y en dev-app-compras el 18/11.

update cc.proveedores set cbu = '3220001805007525710017', alias = 'CRUZDEL.SUR', banco = 'Industrial', cuenta_titular = 'Victor Masson Transportes Cruz del Sur' where codigo = 'PR-026';
update cc.proveedores set cbu = '2850407430094198344311', alias = 'SURIEGO', banco = 'Macro', cuenta_titular = 'Jomaju SRL' where codigo = 'PR-045';
update cc.proveedores set cbu = '0000003100080998577911', alias = '9DEJULIO.M', banco = 'Mercado Pago', cuenta_titular = 'Materiales 9 de Julio SRL' where codigo = 'PR-048';
update cc.proveedores set cbu = '0000003100088291017718', alias = 'LOS.REYES.99', banco = 'Mercado Pago', cuenta_titular = 'Miguel Ángel Reyes' where codigo = 'PR-052';
update cc.proveedores set cbu = '0000003100164884192838', alias = 'DESTILERIA9', banco = 'Mercado Pago', cuenta_titular = 'Enrique Raúl Guardia' where codigo = 'PR-053';
