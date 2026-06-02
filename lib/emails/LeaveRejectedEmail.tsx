import {
    Html,
    Head,
    Body,
    Container,
    Text,
    Heading,
    Hr,
  } from '@react-email/components';
  
  interface LeaveRejectedEmailProps {
    firstName: string;
    lastName: string;
    startDate: string;
    endDate: string;
    workingDays: number;
    rejectionReason: string;
  }
  
  export function LeaveRejectedEmail({
    firstName,
    lastName,
    startDate,
    endDate,
    workingDays,
    rejectionReason,
  }: LeaveRejectedEmailProps) {
    return (
      <Html lang="ro">
        <Head />
        <Body style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f5f5f5' }}>
          <Container style={{ backgroundColor: '#ffffff', padding: '40px', borderRadius: '8px', margin: '40px auto', maxWidth: '600px' }}>
            <Heading style={{ color: '#dc2626' }}>Cerere de concediu respinsă</Heading>
            <Text>Bună ziua, {firstName} {lastName},</Text>
            <Text>
              Ne pare rău să vă informăm că cererea dvs. de concediu a fost respinsă.
            </Text>
            <Hr />
            <Text><strong>Perioadă:</strong> {startDate} – {endDate}</Text>
            <Text><strong>Zile lucrătoare:</strong> {workingDays}</Text>
            <Hr />
            <Text><strong>Motiv respingere:</strong></Text>
            <Text style={{ backgroundColor: '#fef2f2', padding: '12px', borderRadius: '4px', borderLeft: '4px solid #dc2626' }}>
              {rejectionReason}
            </Text>
            <Hr />
            <Text>
              Puteți depune o nouă cerere de concediu pentru o altă perioadă.
            </Text>
            <Text style={{ color: '#666', fontSize: '12px' }}>
              Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest mesaj.
            </Text>
          </Container>
        </Body>
      </Html>
    );
  }