package com.campusai.project;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.List;

/** Plain text only. No executable uploads or automatic third-party processing. */
public record ProjectContent(
        @NotBlank @Size(max = 100) String title,
        @NotBlank @Pattern(regexp = "business|engineering|general") String track,
        LocalDate deadline,
        @NotNull @Size(max = 20000) String brief,
        @NotNull @Size(max = 50000) String manuscript,
        @NotNull @Size(max = 80) List<@NotNull @Valid Requirement> requirements,
        @Valid DataSheet dataSheet,
        @Size(max = 100) List<@NotNull @Valid ReviewFeedback> reviewFeedback) {
    public ProjectContent(String title, String track, LocalDate deadline, String brief, String manuscript, List<Requirement> requirements, DataSheet dataSheet) {
        this(title, track, deadline, brief, manuscript, requirements, dataSheet, null);
    }
    // Old saved projects and callers need no data sheet; do not invent data on migration.
    public ProjectContent(String title, String track, LocalDate deadline, String brief, String manuscript, List<Requirement> requirements) {
        this(title, track, deadline, brief, manuscript, requirements, null);
    }
    public record ReviewFeedback(
            @NotBlank @Size(max = 80) String issueKey,
            @NotBlank @Size(max = 300) String title,
            @NotNull @Pattern(regexp = "[a-f0-9]{64}") String fingerprint,
            @NotBlank @Size(max = 500) String reason) {}
    public record DataSheet(
            @NotNull @Size(max = 50000) String csv,
            @NotNull @Size(max = 300) String source,
            @Min(-1) @Max(29) int measuredColumn,
            @Min(-1) @Max(29) int referenceColumn,
            @NotNull @Size(max = 40) String unit,
            boolean sameUnitConfirmed,
            @NotNull @DecimalMin("0") @DecimalMax("1000") java.math.BigDecimal tolerancePercent,
            @Valid Calculation calculation) {
        public DataSheet(String csv, String source, int measuredColumn, int referenceColumn, String unit,
                         boolean sameUnitConfirmed, java.math.BigDecimal tolerancePercent) {
            this(csv, source, measuredColumn, referenceColumn, unit, sameUnitConfirmed, tolerancePercent, null);
        }
    }
    public record Calculation(
            @NotNull @Size(max=200) String expression,
            @Min(-1) @Max(29) int xColumn,
            @Min(-1) @Max(29) int yColumn,
            @Min(-1) @Max(29) int resultColumn,
            @NotNull @Size(max=40) String xUnit,
            @NotNull @Size(max=40) String yUnit,
            @NotNull @Size(max=40) String outputUnit,
            boolean confirmed,
            @NotNull @DecimalMin("0") @DecimalMax("1000000") java.math.BigDecimal tolerance) {}
    public record Requirement(
            @NotBlank @Size(max = 64) String id,
            @NotBlank @Size(max = 300) String title,
            @Min(0) @Max(20001) int sourceLine,
            @NotNull @Size(max = 1000) String sourceQuote,
            boolean confirmed,
            boolean done,
            @NotNull @Size(max = 2000) String evidence,
            @NotNull @Size(max = 1000) String note) {}
}
