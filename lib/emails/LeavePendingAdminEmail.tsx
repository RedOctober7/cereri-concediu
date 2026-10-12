import {
    Html,
    Head,
    Body,
    Container,
    Text,
    Heading,
    Hr,
  } from '@react-email/components';
  
  interface LeavePendingAdminEmailProps {
    employeeFirstName: string;
    employeeLastName: string;
    startDate: string;
    endDate: string;
    workingDays: number;
    violationReasons: string[];
    approvalUrl: string;
  }
  
  export function LeavePendingAdminEmail({
    employeeFirstName,
    employeeLastName,
    startDate,
    endDate,
    workingDays,
    violationReasons,
    approvalUrl,
  }: LeavePendingAdminEmailProps) {
    return (
      <Html lang="ro">
        <Head />
        <Body style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f5f5f5' }}>
          <Container style={{ backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px', margin: '40px auto', maxWidth: '600px' }}>
            <Heading style={{ color: '#d97706' }}>Cerere de concediu în așteptare</Heading>
            <Text>
              Angajatul <strong>{employeeFirstName} {employeeLastName}</strong> a depus o cerere de concediu care necesită aprobare manuală.
            </Text>
            <Hr />
            <Text><strong>Perioadă:</strong> {startDate} – {endDate}</Text>
            <Text><strong>Zile lucrătoare:</strong> {workingDays}</Text>
            <Hr />
            <Text><strong>Motive pentru aprobare manuală:</strong></Text>
            {violationReasons.map((reason, index) => (
              <Text key={index} style={{ backgroundColor: '#fffbeb', padding: '8px', borderRadius: '4px', borderLeft: '4px solid #d97706', marginBottom: '8px' }}>
                • {reason}
              </Text>
            ))}
            <Hr />
            <Text>
              Accesați panoul de administrare pentru a aproba sau respinge cererea:
            </Text>
            <Text>
              <a href={approvalUrl} style={{ color: '#2f7a46' }}>{approvalUrl}</a>
            </Text>
            <Text style={{ color: '#666', fontSize: '12px' }}>
              Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest mesaj.
            </Text>
          </Container>
        </Body>
      </Html>
    );
  }