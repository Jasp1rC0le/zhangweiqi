package com.campusai.jobs;

public record BackgroundJob(Long id, Long schoolId, String type, Long refId,
                            int attemptCount, int maxAttempts) {
}
