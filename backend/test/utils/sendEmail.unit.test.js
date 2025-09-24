import { vi, describe, it, expect, beforeEach } from "vitest";
import sendEmail from "../../utils/sendEmail.js";

// Mock the modules
vi.mock("@sendgrid/mail", () => ({
    default: {
        setApiKey: vi.fn(),
        send: vi.fn()
    }
}));

vi.mock("nodemailer", () => ({
    createTransport: vi.fn()
}));

import sgMail from "@sendgrid/mail";
import { createTransport } from "nodemailer";

describe("sendEmail", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset environment variables
        delete process.env.SENDGRID_API_KEY;
        delete process.env.SENDGRID_FROM_EMAIL;
        delete process.env.EMAIL_HOST;
        delete process.env.EMAIL_PORT;
        delete process.env.EMAIL_USERNAME;
        delete process.env.EMAIL_PASSWORD;
        delete process.env.EMAIL_FROM;
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_PORT;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;
    });

    describe("SendGrid Provider", () => {
        beforeEach(() => {
            process.env.SENDGRID_API_KEY = "SG.test-key";
            process.env.SENDGRID_FROM_EMAIL = "test@zinnol.app";
        });

        it("should send email using SendGrid successfully", async () => {
            sgMail.send.mockResolvedValue({});

            const result = await sendEmail({
                to: "user@example.com",
                subject: "Test Subject",
                text: "Test message"
            });

            expect(sgMail.setApiKey).toHaveBeenCalledWith("SG.test-key");
            expect(sgMail.send).toHaveBeenCalledWith({
                to: "user@example.com",
                from: "test@zinnol.app",
                subject: "Test Subject",
                text: "Test message",
                html: undefined
            });
            expect(result).toEqual({ provider: "sendgrid", ok: true });
        });

        it("should use default from address when not specified", async () => {
            delete process.env.SENDGRID_FROM_EMAIL;

            sgMail.send.mockResolvedValue({});

            await sendEmail({
                to: "user@example.com",
                subject: "Test Subject",
                text: "Test message"
            });

            expect(sgMail.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: "Zinnol Support <support@zinnol.app>"
                })
            );
        });

        it("should support email alias for to field", async () => {
            sgMail.send.mockResolvedValue({});

            await sendEmail({
                email: "user@example.com",
                subject: "Test Subject",
                text: "Test message"
            });

            expect(sgMail.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: "user@example.com"
                })
            );
        });

        it("should support message alias for text field", async () => {
            sgMail.send.mockResolvedValue({});

            await sendEmail({
                to: "user@example.com",
                subject: "Test Subject",
                message: "Test message"
            });

            expect(sgMail.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: "Test message"
                })
            );
        });

        it("should include HTML content when provided", async () => {
            sgMail.send.mockResolvedValue({});

            await sendEmail({
                to: "user@example.com",
                subject: "Test Subject",
                text: "Plain text",
                html: "<p>HTML content</p>"
            });

            expect(sgMail.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: "Plain text",
                    html: "<p>HTML content</p>"
                })
            );
        });

        it("should fallback to SMTP when SendGrid fails", async () => {
            sgMail.send.mockRejectedValue(new Error("SendGrid error"));

            // Setup SMTP
            process.env.EMAIL_HOST = "smtp.example.com";
            process.env.EMAIL_PORT = "587";
            process.env.EMAIL_USERNAME = "user";
            process.env.EMAIL_PASSWORD = "pass";

            const mockTransporter = { sendMail: vi.fn().mockResolvedValue({}) };
            createTransport.mockReturnValue(mockTransporter);

            const result = await sendEmail({
                to: "user@example.com",
                subject: "Test Subject",
                text: "Test message"
            });

            expect(sgMail.send).toHaveBeenCalled();
            expect(createTransport).toHaveBeenCalled();
            expect(mockTransporter.sendMail).toHaveBeenCalled();
            expect(result).toEqual({ provider: "smtp", ok: true });
        });
    });

    describe("SMTP Provider", () => {
        beforeEach(() => {
            // Setup SMTP environment
            process.env.EMAIL_HOST = "smtp.example.com";
            process.env.EMAIL_PORT = "587";
            process.env.EMAIL_USERNAME = "user";
            process.env.EMAIL_PASSWORD = "pass";
            process.env.EMAIL_FROM = "noreply@zinnol.app";
        });

        it("should send email using SMTP successfully", async () => {
            const mockTransporter = { sendMail: vi.fn().mockResolvedValue({}) };
            createTransport.mockReturnValue(mockTransporter);

            const result = await sendEmail({
                to: "user@example.com",
                subject: "Test Subject",
                text: "Test message"
            });

            expect(createTransport).toHaveBeenCalledWith({
                host: "smtp.example.com",
                port: 587,
                secure: false,
                auth: { user: "user", pass: "pass" }
            });
            expect(mockTransporter.sendMail).toHaveBeenCalledWith({
                from: "noreply@zinnol.app",
                to: "user@example.com",
                subject: "Test Subject",
                text: "Test message",
                html: undefined
            });
            expect(result).toEqual({ provider: "smtp", ok: true });
        });

        it("should use secure connection for port 465", async () => {
            process.env.EMAIL_PORT = "465";

            const mockTransporter = { sendMail: vi.fn().mockResolvedValue({}) };
            createTransport.mockReturnValue(mockTransporter);

            await sendEmail({
                to: "user@example.com",
                subject: "Test Subject",
                text: "Test message"
            });

            expect(createTransport).toHaveBeenCalledWith(
                expect.objectContaining({ secure: true })
            );
        });

        it("should support SMTP environment variable aliases", async () => {
            // Clear EMAIL_* vars and use SMTP_* vars
            delete process.env.EMAIL_HOST;
            delete process.env.EMAIL_PORT;
            delete process.env.EMAIL_USERNAME;
            delete process.env.EMAIL_PASSWORD;

            process.env.SMTP_HOST = "smtp2.example.com";
            process.env.SMTP_PORT = "465";
            process.env.SMTP_USER = "smtpuser";
            process.env.SMTP_PASS = "smtppass";

            const mockTransporter = {
                sendMail: vi.fn().mockResolvedValue({})
            };
            createTransport.mockReturnValue(mockTransporter);

            await sendEmail({
                to: "user@example.com",
                subject: "Test Subject",
                text: "Test message"
            });

            expect(createTransport).toHaveBeenCalledWith({
                host: "smtp2.example.com",
                port: 465,
                secure: true,
                auth: { user: "smtpuser", pass: "smtppass" }
            });
        });
    });

    describe("Error Handling", () => {
        it("should throw error when 'to' is missing", async () => {
            await expect(sendEmail({
                subject: "Test Subject",
                text: "Test message"
            })).rejects.toThrow("'to' and 'subject' are required");
        });

        it("should throw error when 'subject' is missing", async () => {
            await expect(sendEmail({
                to: "user@example.com",
                text: "Test message"
            })).rejects.toThrow("'to' and 'subject' are required");
        });

        it("should throw error when SMTP configuration is missing", async () => {
            // No SendGrid key and no SMTP config
            delete process.env.SENDGRID_API_KEY;

            await expect(sendEmail({
                to: "user@example.com",
                subject: "Test Subject",
                text: "Test message"
            })).rejects.toThrow("SMTP configuration missing");
        });

        it("should handle SendGrid errors gracefully", async () => {
            process.env.SENDGRID_API_KEY = "SG.test-key";
            sgMail.send.mockRejectedValue(new Error("SendGrid API error"));

            // No SMTP fallback configured
            await expect(sendEmail({
                to: "user@example.com",
                subject: "Test Subject",
                text: "Test message"
            })).rejects.toThrow("SMTP configuration missing");
        });
    });
});
