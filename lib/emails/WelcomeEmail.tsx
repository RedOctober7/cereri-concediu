import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type WelcomeEmailProps = {
  fullName: string;
  username: string;
  password: string;
};

export function WelcomeEmail({ fullName, username, password }: WelcomeEmailProps) {
  const appName = process.env.APP_NAME ?? "Cereri Concediu";
  const loginUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/login`;

  return (
    <Html lang="ro">
      <Head />
      <Preview>Bine ai venit în platforma de cereri concediu</Preview>
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "Arial, sans-serif" }}>
        <Container
          style={{
            margin: "24px auto",
            padding: "24px",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            maxWidth: "560px",
          }}
        >
          <Section>
            <Text style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "16px" }}>
              Bun venit, {fullName}!
            </Text>
            <Text>Contul tău a fost creat în aplicația {appName}.</Text>
            <Text>
              Username: <strong>{username}</strong>
            </Text>
            <Text>
              Parolă temporară: <strong>{password}</strong>
            </Text>
            <Text>
              La prima autentificare ți se va cere să schimbi parola.
            </Text>
            <Text>
              Te poți autentifica aici: <a href={loginUrl}>{loginUrl}</a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
