import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  approvalStatement,
  formalName,
  formatCalendarDay,
  formatDateInBucharest,
  formatDateTimeInBucharest,
  workingDaysPhrase,
  type LeaveApproval,
} from './content';
import { PDF_FONT_FAMILY } from './fonts';

const COLORS = {
  text: '#1c2420',
  muted: '#5b665f',
  border: '#d5ddd7',
  subtle: '#f3f7f4',
  accent: '#2f7a46',
};

const FONT_SIZE = 11;

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 80,
    paddingHorizontal: 60,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: FONT_SIZE,
    color: COLORS.text,
  },
  // Pe Page, lineHeight ascunde subsolul poziționat absolut, deci stă pe conținut.
  // Fără unitate, react-pdf îl înmulțește cu fontSize din același stil (implicit 18),
  // nu cu cel moștenit: de aceea fontSize se repetă aici.
  content: {
    fontSize: FONT_SIZE,
    lineHeight: 1.5,
  },
  header: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  employer: {
    fontSize: 12,
    fontWeight: 700,
  },
  muted: {
    color: COLORS.muted,
  },
  title: {
    marginTop: 40,
    marginBottom: 28,
    fontSize: 16,
    fontWeight: 700,
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  addressee: {
    marginBottom: 10,
  },
  paragraph: {
    marginBottom: 20,
    textAlign: 'justify',
  },
  bold: {
    fontWeight: 700,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLast: {
    flexDirection: 'row',
  },
  label: {
    width: '36%',
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: COLORS.subtle,
    color: COLORS.muted,
  },
  value: {
    width: '64%',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  approval: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    backgroundColor: COLORS.subtle,
  },
  approvalHeading: {
    marginBottom: 2,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.8,
    color: COLORS.muted,
  },
  approvalTitle: {
    fontWeight: 700,
    color: COLORS.accent,
  },
  signatures: {
    marginTop: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: 200,
  },
  signatureLine: {
    marginTop: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.text,
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 60,
    right: 60,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: COLORS.muted,
  },
});

export interface CerereConcediuProps {
  request: {
    id: string;
    startDate: Date;
    endDate: Date;
    workingDays: number;
    createdAt: Date;
  };
  user: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    employer: string;
    workPoint?: { name: string } | null;
  };
  approval: LeaveApproval;
  appName: string;
  generatedAt: Date;
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? styles.rowLast : styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/**
 * Cererea de concediu de odihnă: datele angajatului, perioada, data cererii și
 * aprobarea (automată sau de către un administrator). Nu pretinde o semnătură
 * electronică: rândul de semnătură rămâne pentru semnătura olografă.
 */
export function CerereConcediuPDF({
  request,
  user,
  approval,
  appName,
  generatedAt,
}: CerereConcediuProps) {
  const name = formalName(user);
  const period = `${formatCalendarDay(request.startDate)} – ${formatCalendarDay(request.endDate)}`;
  const requestDate = formatDateInBucharest(request.createdAt);
  const statement = approvalStatement(approval);

  return (
    <Document
      title={`Cerere de concediu de odihnă – ${name}`}
      author={user.employer}
      subject={`Concediu de odihnă ${period}`}
      creator={appName}
      producer={appName}
      language="ro"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.employer}>{user.employer}</Text>
            {user.workPoint ? (
              <Text style={styles.muted}>Punct de lucru: {user.workPoint.name}</Text>
            ) : null}
          </View>

          <Text style={styles.title}>CERERE DE CONCEDIU DE ODIHNĂ</Text>

          <Text style={styles.addressee}>Către conducerea {user.employer},</Text>

          <Text style={styles.paragraph}>
            {'Subsemnatul(a) '}
            <Text style={styles.bold}>{name}</Text>
            {`, angajat(ă) la ${user.employer} în funcția de ${user.jobTitle}`}
            {user.workPoint ? `, la punctul de lucru ${user.workPoint.name}` : ''}
            {', vă rog să-mi aprobați efectuarea concediului de odihnă în perioada '}
            <Text style={styles.bold}>{period}</Text>
            {', în total '}
            <Text style={styles.bold}>{workingDaysPhrase(request.workingDays)}</Text>
            {'.'}
          </Text>

          <View style={styles.table}>
            <DetailRow label="Angajat" value={name} />
            <DetailRow label="Funcția" value={user.jobTitle} />
            <DetailRow label="Punct de lucru" value={user.workPoint?.name ?? '—'} />
            <DetailRow label="Perioada" value={period} />
            <DetailRow label="Zile lucrătoare" value={String(request.workingDays)} />
            <DetailRow label="Data cererii" value={requestDate} last />
          </View>

          <View style={styles.approval} wrap={false}>
            <Text style={styles.approvalHeading}>APROBARE</Text>
            <Text style={styles.approvalTitle}>{statement.title}</Text>
            <Text>{statement.detail}</Text>
          </View>

          <View style={styles.signatures} wrap={false}>
            <View>
              <Text style={styles.muted}>Data</Text>
              <Text>{requestDate}</Text>
            </View>
            <View style={styles.signatureBlock}>
              <Text style={styles.muted}>Semnătura angajatului</Text>
              <View style={styles.signatureLine} />
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            Generat de {appName} pe {formatDateTimeInBucharest(generatedAt)} · Cod cerere:{' '}
            {request.id}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
