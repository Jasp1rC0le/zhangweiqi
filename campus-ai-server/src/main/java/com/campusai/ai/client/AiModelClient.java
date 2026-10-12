package com.campusai.ai.client;

import com.campusai.ai.model.AiChatMessage;
import com.campusai.ai.model.AiModelResult;
import com.campusai.ai.model.AiModelProfile;

import java.util.List;
import java.util.function.Consumer;

public interface AiModelClient {

    AiModelResult chat(
            List<AiChatMessage> messages,
            AiModelProfile profile
    );

    AiModelResult streamChat(
            List<AiChatMessage> messages,
            AiModelProfile profile,
            Consumer<String> onDelta
    );
}
