import { renderToBuffer } from '@react-pdf/renderer';
import { CerereConcediuPDF } from './CerereConcediu';
import { createElement } from 'react';

interface GeneratePDFInput {
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

export async function generateLeavePDF(input: GeneratePDFInput): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = createElement(CerereConcediuPDF, input) as any;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}