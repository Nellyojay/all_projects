
export const colors = {
  background: '#000000',
  surface: '#111111',
  ink: '#F5F5F5',
  muted: '#A3A3A3',
  line: '#292929',
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
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
} as const
