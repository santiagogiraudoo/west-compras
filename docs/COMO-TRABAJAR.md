# Cómo trabajar de a varios en este repo

Dos o más personas, cada una con su compu y su propia cuenta de Claude Code, sin pisarse.

## 1. Preparar la compu (una sola vez)

1. Instalar **Node.js 22 LTS** (nodejs.org), **Git** (git-scm.com) y, si querés, **VS Code**.
2. En Windows, habilitar scripts una vez (PowerShell):
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
   ```
3. Configurar tu nombre para que los cambios salgan a tu nombre:
   ```powershell
   git config --global user.name "Tu Nombre"
   git config --global user.email "tu@mail.com"
   ```
4. Bajar el proyecto e instalar:
   ```powershell
   cd $HOME\Documents; mkdir Code -Force; cd Code
   git clone https://github.com/santiagogiraudoo/west-compras.git
   cd west-compras
   npm install
   ```
   Si `npm install` falla con `edgesOut`: `npm install --ignore-scripts` y después `npx prisma generate`.
5. Pedirle a Adriano el archivo **`.env`** (por mensaje privado) y guardarlo en la carpeta `west-compras`. Apunta a la **copia** de la base (rama `dev-app-compras`), nunca a la real.
6. Probar: `npm run dev` y abrir http://localhost:3000. El usuario lo crea Adriano.

Para poder subir cambios, Santiago te suma como colaborador del repo en GitHub (Settings → Collaborators) con tu propia cuenta de GitHub.

## 2. Ramas: cada uno en la suya

- **`main`** es lo que anda. Nadie trabaja directo en `main`.
- Cada uno trabaja en **su rama**, con su nombre y el tema:
  - `adriano/<tema>` — lógica: aprobación, pagos, base de datos, reglas.
  - `ui/<tema>` — pantallas y diseño: `ui/tarjeta-aprobacion`, `ui/bandeja`, etc.

### Empezar un tema
```powershell
git checkout main
git pull
git checkout -b ui/bandeja
```

### Mientras trabajás
```powershell
git add <archivos que cambiaste>
git commit -m "fix(bandeja): columna de montos alineada a la derecha"
git push -u origin ui/bandeja        # la primera vez; después alcanza con git push
```

### Traer lo nuevo de main a tu rama (todos los días, antes de arrancar)
```powershell
git checkout ui/bandeja
git pull origin main
```
Si aparece un conflicto, pedile a Claude Code: "resolvé el conflicto con main sin perder lo de ninguno de los dos".

### Entregar
En GitHub: **Pull requests → New pull request**, de tu rama hacia `main`. El otro lo mira (o lo prueba con `git checkout ui/bandeja; npm run dev`) y lo une con **Merge**. Después borrás tu rama y arrancás otra desde `main`.

## 3. Quién toca qué (para no pisarse)

| Rama | Puede tocar | No toca |
|---|---|---|
| `ui/...` (diseño) | `src/components/**`, la parte visual de `src/app/**/page.tsx` y de los formularios, `src/app/globals.css`, `docs/design-system/` | `src/lib/**` (reglas y consultas), `**/actions.ts`, `sql/`, `prisma/`, tests de lógica |
| `adriano/...` (lógica) | todo, pero si cambia una pantalla, avisa a quien esté en `ui/` | — |

Si desde `ui/` hace falta un dato que la pantalla no recibe (un campo nuevo, otra consulta), no lo agregues en `src/lib`: anotalo en el pull request o pedíselo a quien está en lógica.

## 4. Reglas de diseño (rama ui/)

- Design system de la app de alquileres: `docs/design-system/README.html` (off-white `#FFFEFC`, verde `#1B4332`, dorado `#B8960C`).
- Dinero siempre con `<MoneyCell>`, formato argentino ($1.234.567,89).
- Botones `size="sm"` con icono lucide antes del texto. Reusar los componentes de `src/components/ui` y `src/components/shared` antes de crear nuevos.
- Pensado para compu (pantalla grande), no para celular.
- Lo que ve quien aprueba: corto. Tabla de la OP + chequeos en verde/amarillo + "Ver más" (ver `docs/proyecto/03_definiciones.md`).

## 5. Pedido para arrancar Claude Code en una rama de diseño

```
Leé CLAUDE.md, docs/COMO-TRABAJAR.md y docs/design-system/README.html.
Estás en una rama ui/: solo cambiás cómo se ve, no la lógica (no toques src/lib, actions.ts, sql ni prisma).
Mejorá <pantalla>: <qué querés que cambie>.
Probá con npm run dev, commits chicos y push a tu rama. No hagas merge a main.
```

## Cambios en la base (`sql/`)

- Cada cambio es un archivo nuevo con el número que sigue. **Un `sql/` ya aplicado no se edita**: se agrega otro.
- 013 y 014 son de la rama `ui/primer-tema`; lo nuevo sigue desde 017. Antes de crear uno, mirá en `origin` que nadie haya tomado ese número.
- Se aplica con `scripts/aplicar-sql.ts` y la conexión del dueño en `OWNER_URL` (nunca en el repo). Sin `--aplicar` solo muestra qué falta; con `--aplicar` lo aplica y lo anota en `app.migraciones`. Primero en dev; si anda, en production.
- `app.v_controles` lista lo que no cierra (imputado de más, OP pagada sin autorizar, renglones que no suman, unidad sin aprobador). Sale en el Inicio: después de un cambio tiene que seguir vacía.
