export async function getServerSideProps(context) {
  const id = typeof context?.params?.id === 'string' ? context.params.id : '';
  const rawMode = context?.query?.mode;
  const mode = typeof rawMode === 'string' && rawMode.trim().length > 0 ? rawMode : null;

  const destinationBase = id ? `/rank/${id}/match-ready` : '/match';
  const destination = mode
    ? `${destinationBase}?mode=${encodeURIComponent(mode)}`
    : destinationBase;

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
}

export default function LegacyRankMatchRedirectPage() {
  return null;
}
