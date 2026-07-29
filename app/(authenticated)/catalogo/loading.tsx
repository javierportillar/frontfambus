export default function CatalogLoading(): JSX.Element {
  return (
    <div className="space-y-5" aria-label="Cargando catálogo">
      <div className="h-52 animate-pulse rounded-[2rem] bg-surface-alt" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface-alt" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div
            key={index}
            className="h-72 animate-pulse rounded-2xl bg-surface-alt"
          />
        ))}
      </div>
    </div>
  );
}
