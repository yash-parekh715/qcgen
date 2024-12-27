"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QRCodeGenerator = void 0;
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const QRCode = require("qrcode");
const Jimp = require("jimp");
const logger_service_1 = require("./logger.service");
/**
 * Class to generate QR codes from an Excel file with optional user column input and optional logo input.
 *
 * @param source - The path to the Excel file.
 * @param logoPath - The path to the logo file
 * @param urlTag - The column header containing the URLs. Defaults to 'LINK'.
 * @param nameTag - The column header containing the names. Defaults to 'CODE'.
 */
class QRCodeGenerator {
    constructor(source, urlTag, nameTag, logoPath, jobId) {
        this.source = source;
        this.urlTag = urlTag;
        this.nameTag = nameTag;
        this.logoPath = logoPath;
        this.outputDir = "./qrcodes";
        this.workbook = xlsx.readFile(this.source);
        this.sheetName = this.workbook.SheetNames[0];
        this.jobId = jobId || `qr-${Date.now()}`;
        logger_service_1.logger.startJobLog(this.jobId);
        // Validate and create the output directory
        this.ensureOutputDirectory();
        // Read and process the Excel file
        if (this.readExcel()) {
            // this.generateQRCodes(logoFilePath);
            this.generateQRCodes();
        }
    }
    /**
     * Ensure the output directory exists.
     */
    ensureOutputDirectory() {
        try {
            if (!fs.existsSync(this.outputDir)) {
                fs.mkdirSync(this.outputDir);
                logger_service_1.logger.info(this.jobId, `Created output directory: ${this.outputDir}`);
            }
        }
        catch (error) {
            logger_service_1.logger.error(this.jobId, "Failed to create output directory", error);
            throw error;
        }
    }
    /**
     * Reads the Excel file and validates default or user-specified columns.
     */
    readExcel() {
        try {
            this.sheet = xlsx.utils.sheet_to_json(this.workbook.Sheets[this.sheetName]);
            logger_service_1.logger.info(this.jobId, `Successfully read Excel file with ${this.sheet.length} rows`);
            if (!this.validateColumns()) {
                logger_service_1.logger.error(this.jobId, `Invalid columns: '${this.urlTag}' or '${this.nameTag}' not found`);
                return false;
            }
            return true;
        }
        catch (error) {
            logger_service_1.logger.error(this.jobId, "Failed to read Excel file", error);
            return false;
        }
    }
    /**
     * Validates if specified or default columns exist in the Excel sheet.
     */
    validateColumns() {
        const sampleRow = this.sheet[0]; // Take the first row as a sample
        if (!sampleRow) {
            console.error("Error: Excel file is empty.");
            return false;
        }
        const columnNames = Object.keys(sampleRow);
        // Convert both the input tags and existing column names to lowercase for comparison
        const normalizedColumnNames = columnNames.map((col) => col.trim().toLowerCase());
        const normalizedUrlTag = this.urlTag.trim().toLowerCase();
        const normalizedNameTag = this.nameTag.trim().toLowerCase();
        // Check if the normalized columns exist
        const urlColumnExists = normalizedColumnNames.includes(normalizedUrlTag);
        const nameColumnExists = normalizedColumnNames.includes(normalizedNameTag);
        if (!urlColumnExists || !nameColumnExists) {
            console.error(`Error: Required columns not found.
        Looking for: '${this.urlTag}' and '${this.nameTag}'
        Available columns: ${columnNames.join(", ")}`);
            return false;
        }
        // If we've made it here, columns exist
        return true;
    }
    /**
     * Generates QR codes with an optional logo for each row in the Excel file.
     */
    async generateQRCodes() {
        logger_service_1.logger.info(this.jobId, "Starting QR code generation");
        for (const [index, row] of this.sheet.entries()) {
            const link = row[this.urlTag];
            const name = row[this.nameTag];
            if (link && name) {
                const sanitizedName = this.sanitizeFilename(name);
                try {
                    if (this.logoPath) {
                        await this.generateQRCodeWithLogo(link, sanitizedName, this.logoPath);
                        logger_service_1.logger.info(this.jobId, `Generated QR code with logo for ${name}`);
                    }
                    else {
                        await this.generateBasicQRCode(link, sanitizedName);
                        logger_service_1.logger.info(this.jobId, `Generated basic QR code for ${name}`);
                    }
                }
                catch (error) {
                    logger_service_1.logger.error(this.jobId, `Failed to generate QR code for ${name}`, error);
                }
            }
            else {
                logger_service_1.logger.warn(this.jobId, `Invalid data in row ${index + 1}`, {
                    link,
                    name,
                });
            }
        }
        logger_service_1.logger.info(this.jobId, "Completed QR code generation");
    }
    getJobId() {
        return this.jobId;
    }
    getJobLogs() {
        return logger_service_1.logger.getJobLogs(this.jobId);
    }
    //generate the basic qr code if the user has not given their logo as the input
    async generateBasicQRCode(link, name) {
        try {
            // Generate basic QR code without logo
            const qrCodeBuffer = await QRCode.toBuffer(link, {
                errorCorrectionLevel: "H",
                width: 500,
            });
            // Save the QR code
            const outputFilePath = path.join(this.outputDir, `${name}.png`);
            await fs.promises.writeFile(outputFilePath, qrCodeBuffer);
            console.log(`Basic QR Code for '${name}' saved to '${outputFilePath}'`);
        }
        catch (error) {
            console.error(`Error generating basic QR code for '${name}':`, error);
        }
    }
    /**
     * Sanitizes a filename to be safe for file system
     */
    sanitizeFilename(filename) {
        // Remove invalid characters and replace with underscores
        return filename
            .toString()
            .replace(/[/\\?%*:|"<>]/g, "_") // Remove invalid file system characters
            .trim() // Remove leading/trailing whitespace
            .substring(0, 255); // Limit filename length
    }
    /**
     * Generates a QR code with an embedded logo.
     */
    async generateQRCodeWithLogo(link, name, logoPath) {
        try {
            // Generate the QR code as a buffer
            const qrCodeBuffer = await QRCode.toBuffer(link, {
                errorCorrectionLevel: "H",
                width: 500,
            });
            // Load the QR code and logo image
            const qrImage = await Jimp.read(qrCodeBuffer);
            const logo = await Jimp.read(logoPath);
            // Resize the logo
            logo.resize(80, 80);
            // Calculate center position for the logo
            const xPos = qrImage.bitmap.width / 2 - logo.bitmap.width / 2;
            const yPos = qrImage.bitmap.height / 2 - logo.bitmap.height / 2;
            // Composite the logo onto the QR code
            qrImage.composite(logo, xPos, yPos);
            // Save the QR code as a file
            const outputFilePath = path.join(this.outputDir, `${name}.png`);
            await qrImage.writeAsync(outputFilePath);
            console.log(`QR Code for '${name}' saved to '${outputFilePath}'`);
        }
        catch (error) {
            console.error(`Error generating QR code for '${name}':`, error);
        }
    }
    getOutputDirectory() {
        return this.outputDir;
    }
}
exports.QRCodeGenerator = QRCodeGenerator;
