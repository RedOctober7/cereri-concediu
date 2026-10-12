import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

type PasswordResetEmailProps = {
  appName: string;
  firstName: string;
  username: string;
  resetUrl: string;
  validMinutes: number;
};

export function PasswordResetEmail({
  appName,
  firstName,
  username,
  resetUrl,
  validMinutes,
}: PasswordResetEmailProps) {
  return (
    <Html lang="ro">
      <Head />
      <Preview>Linkul pentru setarea unei parole noi în {appName}</Preview>
      <Body style={{ backgroundColor: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "40px",
            borderRadius: "8px",
            margin: "40px auto",
            maxWidth: "600px",
          }}
        >
          <Heading style={{ color: "#1a1a1a" }}>Resetare parolă</Heading>
          <Text>Bună ziua, {firstName},</Text>
          <Text>
            Am primit o cerere de resetare a parolei pentru contul tău din {appName}{" "}
            (utilizator: <strong>{username}</strong>). Apasă butonul de mai jos ca să
            setezi o parolă nouă.
          </Text>
          <Button
            href={resetUrl}
            style={{
              backgroundColor: "#2f7a46",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "6px",
              fontWeight: "bold",
              textDecoration: "none",
            }}
          >
            Setează o parolă nouă
          </Button>
          <Text>
            Linkul este valabil {validMinutes} de minute și poate fi folosit o singură
            dată. Dacă butonul nu merge, copiază adresa în browser:
          </Text>
          <Text style={{ wordBreak: "break-all", color: "#2f7a46" }}>{resetUrl}</Text>
          <Text>
            Dacă nu tu ai cerut resetarea, ignoră acest email: parola rămâne
            neschimbată.
          </Text>
          <Text style={{ color: "#666", fontSize: "12px" }}>
            Acest email a fost generat automat. Te rugăm să nu răspunzi la acest mesaj.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
