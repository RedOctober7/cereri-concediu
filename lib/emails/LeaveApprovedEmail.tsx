import {
    Html,
    Head,
    Body,
    Container,
    Text,
    Heading,
    Hr,
  } from '@react-email/components';
  
  interface LeaveApprovedEmailProps {
    firstName: string;
    lastName: string;
    startDate: string;
    endDate: string;
    workingDays: number;
    availableDaysAfter: number;
    approvedByAdmin: boolean;
  }
  
  export function LeaveApprovedEmail({
    firstName,
    lastName,
    startDate,
    endDate,
    workingDays,
    availableDaysAfter,
    approvedByAdmin,
  }: LeaveApprovedEmailProps) {
    return (
      <Html lang="ro">
        <Head />
        <Body style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f5f5f5' }}>
          <Container style={{ backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px', margin: '40px auto', maxWidth: '600px' }}>
            <Heading style={{ color: '#1a1a1a' }}>Cerere de concediu aprobată</Heading>
            <Text>Bună ziua, {firstName} {lastName},</Text>
            <Text>
              Cererea dvs. de concediu a fost{' '}
              {approvedByAdmin ? 'aprobată de administrator' : 'aprobată automat'}.
            </Text>
            <Hr />
            <Text><strong>Perioadă:</strong> {startDate} – {endDate}</Text>
            <Text><strong>Zile lucrătoare:</strong> {workingDays}</Text>
            <Text><strong>Zile disponibile rămase:</strong> {availableDaysAfter}</Text>
            <Hr />
            <Text>În atașament găsiți cererea de concediu în format PDF.</Text>
            <Text style={{ color: '#666', fontSize: '12px' }}>
              Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest mesaj.
            </Text>
          </Container>
        </Body>
      </Html>
    );
  }