import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

const styles = StyleSheet.create({
  page: {
    padding: 60,
    fontFamily: 'Times-Roman',
    fontSize: 13,
  },
  title: {
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 80,
    fontFamily: 'Times-Roman',
  },
  body: {
    lineHeight: 1.8,
    textAlign: 'justify',
  },
  bold: {
    fontFamily: 'Times-Bold',
  },
  footer: {
    position: 'absolute',
    bottom: 100,
    left: 60,
    right: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 12,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 10,
  },
});

function formatDate(date: Date): string {
  return format(new Date(date), 'dd.MM.yyyy', { locale: ro });
}

interface CerereConcediuProps {
  request: {
    id: string;
    startDate: Date;
    endDate: Date;
    workingDays: number;
    approvedAt?: Date | null;
    createdAt: Date;
  };
  user: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    employer: string;
    workPoint?: { name: string } | null;
  };
}

export function CerereConcediuPDF({ request, user }: CerereConcediuProps) {
  const signatureDate = request.approvedAt || request.createdAt;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Cerere concediu</Text>

        <View style={styles.body}>
          <Text>
            {'Subsemnatul(a) '}
            <Text style={styles.bold}>
              {user.lastName} {user.firstName}
            </Text>
            {', având funcția de '}
            <Text style={styles.bold}>{user.jobTitle}</Text>
            {', angajat al '}
            <Text style={styles.bold}>{user.employer}</Text>
            {user.workPoint ? `, la punctul de lucru ${user.workPoint.name},` : ','}
            {' prin prezenta solicit efectuarea concediului legal de odihnă începând cu data de '}
            <Text style={styles.bold}>{formatDate(request.startDate)}</Text>
            {' și până la data de '}
            <Text style={styles.bold}>{formatDate(request.endDate)}</Text>
            {', reprezentând '}
            <Text style={styles.bold}>{request.workingDays}</Text>
            {' zile de concediu.'}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text>Data: {formatDate(signatureDate)}</Text>
          <Text>
            Semnătura: Semnat electronic ({request.id.slice(0, 8)})
          </Text>
        </View>

        <Text style={styles.pageNumber}>1</Text>
      </Page>
    </Document>
  );
}