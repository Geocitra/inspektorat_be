// src/document-ingestion/parsers/xlsx-parser.adapter.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DocumentParser } from './document-parser.interface';
import * as ExcelJS from 'exceljs';

@Injectable()
export class XlsxParserAdapter implements DocumentParser {
    async parse(buffer: Buffer): Promise<string> {
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer as any);

            let extractedText = '';

            // Iterasi ke setiap lembar kerja (worksheet)
            workbook.eachSheet((worksheet, sheetId) => {
                extractedText += `\n--- Lembar Kerja (Sheet): ${worksheet.name} ---\n`;

                // Iterasi ke setiap baris
                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                    const rowValues: string[] = [];

                    // Iterasi ke setiap sel pada baris tersebut
                    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                        let cellValue = '';
                        const val = cell.value;

                        if (val !== null && val !== undefined) {
                            if (typeof val === 'object') {
                                // Tangani jika cell berisi formula
                                if ('result' in val) {
                                    cellValue = String(val.result);
                                }
                                // Tangani jika cell berisi Rich Text (teks yang di-format)
                                else if ('richText' in val) {
                                    cellValue = (val as any).richText.map((rt: any) => rt.text).join('');
                                } else {
                                    cellValue = String(val);
                                }
                            } else {
                                cellValue = String(val);
                            }
                        }

                        if (cellValue.trim() !== '') {
                            rowValues.push(cellValue.trim());
                        }
                    });

                    // Gabungkan nilai sel dalam satu baris dengan pemisah pipa (|)
                    if (rowValues.length > 0) {
                        extractedText += rowValues.join(' | ') + '\n';
                    }
                });
            });

            return extractedText;
        } catch (error: any) {
            throw new InternalServerErrorException(
                `Gagal mengurai berkas XLSX: ${error.message}`,
            );
        }
    }
}