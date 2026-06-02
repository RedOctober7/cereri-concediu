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
  const element = createElement(CerereConcediuPDF, input);
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}