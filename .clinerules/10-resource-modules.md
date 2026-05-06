# DarkMoney Resource Module Rules

Toda pantalla tipo recurso debe componerse con `ResourceModuleTemplate`.

## Orden obligatorio de slots
Respetar este orden visual:

1. `header`
2. `toolbar`
3. `activeFilters`
4. `context`
5. `summary`
6. `bulkActions`
7. `list`
8. `fab`
9. `overlays`

Ejemplo:

```tsx
<ResourceModuleTemplate
  topInset={insets.top}
  header={...}
  toolbar={...}
  activeFilters={...}
  context={...}
  summary={...}
  bulkActions={...}
  list={...}
  fab={...}
  overlays={...}
/>