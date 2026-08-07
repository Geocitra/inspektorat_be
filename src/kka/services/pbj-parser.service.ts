// src/kka/services/pbj-parser.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface NormalizedPbjRow {
    rowNumber: number;
    itemName: string;
    volume: number;
    price: number;
    totalPrice: number;
}

interface ColumnMapping {
    itemCol: number;
    volumeCol: number;
    priceCol: number;
    totalCol: number;
}

@Injectable()
export class PbjParserService {
    private readonly logger = new Logger(PbjParserService.name);

    // Kamus kata kunci untuk pencarian indeks kolom otomatis secara dinamis
    private readonly keywords = {
        item: ['nama', 'uraian', 'barang', 'deskripsi', 'item', 'pekerjaan', 'spesifikasi', 'rincian'],
        volume: ['vol', 'qty', 'jumlah', 'banyak', 'kuantitas', 'satuan'],
        price: ['satuan', 'harga', 'tarif', 'nilai', 'harga_satuan', 'hargasatuan'],
        total: ['total', 'subtotal', 'jumlah_harga', 'jumlah_total', 'sub_total'],
    };

    /**
     * Membaca dan menormalisasi berkas Excel (RKA atau SPJ) menjadi objek JSON standar.
     */
    async parseAndNormalize(
        buffer: Buffer,
        sheetName?: string,
        forcedRowStart?: number,
    ): Promise<NormalizedPbjRow[]> {
        this.logger.log(`Memulai parsing biner Excel...`);

        const workbook = new ExcelJS.Workbook();
        try {
            await workbook.xlsx.load(buffer as any);
        } catch (err) {
            throw new BadRequestException('Validasi penguraian gagal. Berkas biner Excel rusak atau tidak didukung.');
        }

        // Ambil sheet berdasarkan nama, jika tidak diisi ambil sheet pertama
        const worksheet = sheetName
            ? workbook.getWorksheet(sheetName)
            : workbook.worksheets[0];

        if (!worksheet) {
            throw new BadRequestException(
                `Lembar kerja (Sheet) "${sheetName || 'Pertama'}" tidak ditemukan pada dokumen Excel.`
            );
        }

        this.logger.log(`Menjalankan Dynamic Header Detection pada sheet: "${worksheet.name}"...`);

        // Temukan baris header dan indeks kolom secara otomatis
        const { headerRowIndex, mapping } = this.detectColumnMapping(worksheet, forcedRowStart);

        const startRow = forcedRowStart || (headerRowIndex + 1);
        this.logger.log(`Parsing baris dimulai dari baris ke-${startRow} menggunakan indeks kolom Rencana/Realisasi: ` +
            `Item_Col: ${mapping.itemCol}, Vol_Col: ${mapping.volumeCol}, Price_Col: ${mapping.priceCol}`);

        const normalizedRows: NormalizedPbjRow[] = [];

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber < startRow) return;

            const itemName = this.cleanString(this.extractCellValue(row.getCell(mapping.itemCol)));
            const volume = this.cleanInteger(this.extractCellValue(row.getCell(mapping.volumeCol)));
            const price = this.cleanFloat(this.extractCellValue(row.getCell(mapping.priceCol)));
            const totalPrice = this.cleanFloat(this.extractCellValue(row.getCell(mapping.totalCol))) || (volume * price);

            // Hanya masukkan baris yang memiliki deskripsi nama barang/kegiatan yang valid
            if (itemName && itemName.length > 2) {
                normalizedRows.push({
                    rowNumber,
                    itemName,
                    volume,
                    price,
                    totalPrice,
                });
            }
        });

        this.logger.log(`Penguraian selesai. Mengembalikan ${normalizedRows.length} baris data terstruktur.`);
        return normalizedRows;
    }

    /**
     * Mendeteksi baris header dan memetakan indeks kolom secara dinamis berdasarkan pencocokan kata kunci.
     */
    private detectColumnMapping(worksheet: ExcelJS.Worksheet, forcedRowStart?: number): { headerRowIndex: number; mapping: ColumnMapping } {
        let headerRowIndex = 1;
        const mapping: ColumnMapping = {
            itemCol: 2,   // Default fallback kolom B
            volumeCol: 3, // Default fallback kolom C
            priceCol: 4,  // Default fallback kolom D
            totalCol: 5,  // Default fallback kolom E
        };

        const maxSearchRows = Math.min(worksheet.rowCount, forcedRowStart ? forcedRowStart : 10);

        for (let r = 1; r <= maxSearchRows; r++) {
            const row = worksheet.getRow(r);
            let matches = 0;
            const tempMapping = { ...mapping };

            row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                const cellText = (cell.text || '').toLowerCase().trim();
                if (!cellText) return;

                // Cari kecocokan kolom nama barang
                if (this.keywords.item.some(keyword => cellText.includes(keyword)) && matches < 4) {
                    tempMapping.itemCol = colNumber;
                    matches++;
                }
                // Cari kecocokan kolom kuantitas / volume
                else if (this.keywords.volume.some(keyword => cellText.includes(keyword)) && matches < 4) {
                    tempMapping.volumeCol = colNumber;
                    matches++;
                }
                // Cari kecocokan kolom harga satuan
                else if (this.keywords.price.some(keyword => cellText.includes(keyword)) && matches < 4) {
                    tempMapping.priceCol = colNumber;
                    matches++;
                }
                // Cari kecocokan kolom jumlah total harga
                else if (this.keywords.total.some(keyword => cellText.includes(keyword)) && matches < 4) {
                    tempMapping.totalCol = colNumber;
                    matches++;
                }
            });

            // Jika dalam satu baris ditemukan minimal 3 kecocokan kata kunci kolom, kita asumsikan ini baris header
            if (matches >= 3) {
                headerRowIndex = r;
                mapping.itemCol = tempMapping.itemCol;
                mapping.volumeCol = tempMapping.volumeCol;
                mapping.priceCol = tempMapping.priceCol;
                mapping.totalCol = tempMapping.totalCol;
                this.logger.log(`Header terdeteksi otomatis pada baris ke-${r}.`);
                break;
            }
        }

        return { headerRowIndex, mapping };
    }

    /**
     * Ekstraktor aman untuk menangani berbagai variasi tipe nilai sel dalam ExcelJS (formula, text, richText).
     */
    private extractCellValue(cell: ExcelJS.Cell): any {
        const value = cell.value;
        if (value === null || value === undefined) return '';

        // Tangani jika tipe data berupa hasil formula excel
        if (typeof value === 'object' && 'result' in value) {
            return value.result;
        }
        // Tangani jika tipe data berupa objek formula tanpa hasil (jarang terjadi)
        if (typeof value === 'object' && 'formula' in value) {
            return cell.text;
        }
        // Tangani jika tipe data berupa RichText
        if (typeof value === 'object' && 'richText' in value) {
            return value.richText.map(t => t.text).join('');
        }

        return value;
    }

    private cleanString(val: any): string {
        if (!val) return '';
        return String(val).trim().replace(/\s+/g, ' ');
    }

    private cleanInteger(val: any): number {
        if (!val) return 0;
        const parsed = parseInt(String(val).replace(/[^0-9-]/g, ''), 10);
        return isNaN(parsed) ? 0 : parsed;
    }

    private cleanFloat(val: any): number {
        if (!val) return 0;
        // Bersihkan karakter pemisah ribuan titik/koma agar aman di-convert ke float JS
        const sanitized = String(val)
            .replace(/[^0-9.,-]/g, '')
            .replace(/,/g, '.');
        const parsed = parseFloat(sanitized);
        return isNaN(parsed) ? 0 : parsed;
    }
}