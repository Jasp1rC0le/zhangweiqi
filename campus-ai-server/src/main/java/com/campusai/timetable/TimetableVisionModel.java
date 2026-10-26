package com.campusai.timetable;

import com.campusai.ai.model.AiModelResult;

public interface TimetableVisionModel {
    record Capability(int version,boolean available,String provider,String model,String destination,int maxBytes,int maxRows,int maxInputTokens,int maxOutputTokens) {}
    Capability capability();
    int estimate(byte[] image,String mime);
    AiModelResult recognize(byte[] image,String mime);
}
