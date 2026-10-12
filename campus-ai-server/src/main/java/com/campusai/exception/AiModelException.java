package com.campusai.exception;

public class AiModelException extends RuntimeException {

    public AiModelException(String message) {
        super(message);
    }

    public AiModelException(
            String message,
            Throwable cause) {

        super(message, cause);
    }
}