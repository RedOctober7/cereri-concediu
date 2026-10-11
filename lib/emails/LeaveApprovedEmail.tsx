import {
    Html,
    Head,
    Body,
    Container,
    Text,
    Heading,
    Hr,
    Link,
  } from '@react-email/components';

  interface LeaveApprovedEmailProps {
    firstName: string;
    lastName: string;
    startDate: string;
    endDate: string;
    workingDays: number;
    availableDaysAfter: number;
    approvedByAdmin: boolean;
    /** false când PDF-ul nu a putut fi generat: emailul trimite la pagina cererilor. */
    pdfAttached?: boolean;
    /** Pagina „Cererile mele”, de unde se descarcă PDF-ul. */
    leavesUrl?: string;
  }

  export function LeaveApprovedEmail({
    firstName,
    lastName,
    startDate,
    endDate,
    workingDays,
    availableDaysAfter,
    approvedByAdmin,
    pdfAttached = true,
    leavesUrl,
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
            {pdfAttached ? (
              <Text>În atașament găsiți cererea de concediu în format PDF.</Text>
            ) : (
              <Text>
                Cererea de concediu în format PDF se poate descărca din aplicație
                {leavesUrl ? (
                  <>
                    {', din pagina '}
                    <Link href={leavesUrl} style={{ color: '#2f7a46' }}>Cererile mele</Link>
                  </>
                ) : null}
                .
              </Text>
            )}
            <Text style={{ color: '#666', fontSize: '12px' }}>
              Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest mesaj.
            </Text>
          </Container>
        </Body>
      </Html>
    );
  }
