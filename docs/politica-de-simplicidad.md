# Política de simplicidad

Cómo quiero que Claude piense antes de escribir código en este repo. No son reglas de estilo:
son tres criterios para decidir *qué* construir.

---

## 1. Simplificar al máximo

El objetivo de un cambio es dejar el sistema más chico, no más grande. Si un cambio agrega más
código del que saca, eso no está prohibido pero hay que justificarlo: qué se gana, y por qué no
se podía lograr sacando.

La pregunta antes de agregar una función, un flag, un campo o una rama de `if`: ¿esto es nuevo
de verdad, o es algo que ya existe con otro nombre?

## 2. Sacar la info de las fuentes de verdad

Esto ya está en `CLAUDE.md` y lo repito porque es la base de todo lo demás: el saldo sale de
`computeLedgerBalance`, nunca de un loop propio. Los balances cacheados son **cache**, no verdad
— para cualquier decisión financiera se recalcula desde los cargos. `Property.status` se computa,
no se guarda.

El patrón general: cuando un dato se puede derivar, se deriva. Guardar una copia significa que
tarde o temprano vas a tener dos versiones del mismo número y ninguna forma de saber cuál está
bien.

## 3. Construir sistemas que funcionen para TODO — evitar las excepciones

Este es el corazón.

Cuando aparece un caso que la regla actual no contempla, la pregunta que se siente natural es
"¿qué regla nueva le invento a este caso?". Esa es la pregunta equivocada. La correcta es:
**¿por qué mi regla actual no lo cubre?**

Una regla pareja que cubre todo le gana a una regla simple más una excepción, aunque la
excepción parezca más barata hoy. Porque el costo de la excepción no es la línea que la crea:
es todo lo que viene después.

---

## El caso de las expensas

El requerimiento original decía dos cosas juntas:

1. Un ledger por componente de alquiler, para separar ARS de USD.
2. Un ledger separado para expensas.

La primera línea separa **monedas**. Eso es una restricción real: no podés netear dólares contra
pesos, no existe forma de sumarlos. La segunda tomó esa misma herramienta y la usó para separar
**conceptos**. Y separar conceptos no protege de nada — una expensa y un alquiler en pesos se
suman perfectamente bien.

### Qué pasó

Las expensas quedaron en una cuenta propia que **nunca puede recibir un pago**, porque el
diálogo de pago siempre apunta a la cuenta principal. Resultado: 59 cuentas de expensas con
**cero pagos en toda su historia**. Expensas que figuran impagas para siempre y devengan mora
que no corresponde. La pantalla mostraba una cuenta y el motor calculaba dos.

### Qué costó de verdad

No costó la línea que creó la excepción. Costó que **cada lugar del código que toca cuentas tuvo
que aprender que existen dos tipos**. La auditoría de la fase encontró:

- **Tres** lugares distintos que borran cargos filtrando por "lo generó el sistema", sin
  preguntar de qué son.
- Un campo que todos creían que servía solo para saber la moneda, y que en realidad carga
  política de mora, canon, IVA y dos candados.
- Un filtro cuya sola remoción rompe la edición de contratos.

Nada de eso existiría si la regla hubiera sido pareja desde el principio.

### La prueba de que la excepción era arbitraria

Los gastos del propietario son conceptualmente lo mismo que las expensas: un cargo que no es
alquiler. Siempre fueron al ledger de alquiler, sin drama, sin cuenta propia, sin problemas.
Si el mismo tipo de cosa funciona bien de un lado y mal del otro, la diferencia no era real.

### La regla correcta

**Una cuenta por moneda, y punto.**

Las expensas se distinguen por su **categoría**, no por su cuenta. Un cargo de expensas es un
cargo más: devenga mora como cualquiera y se rige por las mismas reglas. Que sea automático o
manual no hace ninguna diferencia.

---

## Antes de agregar un caso especial, preguntate

1. **¿Esta separación protege de algo real, o solo nombra una diferencia conceptual?**
   Monedas distintas no se pueden sumar — eso es real. "Son conceptos distintos" no lo es.

2. **¿Qué tiene que aprender el resto del código para que esta excepción funcione?**
   Si la respuesta es "todo lugar que toque X", la excepción ya salió cara y todavía no la
   escribiste.

3. **¿Hay algo parecido que hoy funciona sin la excepción?**
   Si sí, esa es tu respuesta: la regla pareja alcanza. La excepción era arbitraria.
