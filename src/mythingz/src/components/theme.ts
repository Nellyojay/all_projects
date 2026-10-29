
export const colors = {
  background: '#000000',
  surface: '#202020b6',
  ink: '#F5F5F5',
  muted: '#A3A3A3',
  line: '#323232',
  green: '#E5E5E5',
  greenSoft: '#303030',
  orange: '#B8B8B8',
  orangeSoft: '#303030',
  yellow: '#F5F5F5',
  yellowSoft: '#303030',
  blueSoft: '#303030',
};

export const styles = {
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingInline: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  panelGrid: {
    display: 'grid',
    width: '100%',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
} as const
