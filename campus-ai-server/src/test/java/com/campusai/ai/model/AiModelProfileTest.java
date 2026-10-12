package com.campusai.ai.model;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiModelProfileTest {

    @Test
    void shouldDefaultToStandardModel() {
        assertThat(AiModelProfile.fromKey(null))
                .isEqualTo(AiModelProfile.STANDARD);
        assertThat(AiModelProfile.fromKey(" "))
                .isEqualTo(AiModelProfile.STANDARD);
    }

    @Test
    void shouldAllowFreeModelsButProtectPro() {
        assertThat(AiModelProfile.STANDARD.isAvailableTo("STUDENT"))
                .isTrue();
        assertThat(AiModelProfile.THINKING.isAvailableTo("STUDENT"))
                .isTrue();
        assertThat(AiModelProfile.PRO.isAvailableTo("STUDENT"))
                .isFalse();
        assertThat(AiModelProfile.PRO.isAvailableTo("ADMIN"))
                .isTrue();
    }

    @Test
    void shouldRouteLongTextAndCodingProfilesToDedicatedProviders() {
        assertThat(AiModelProfile.KIMI.getProvider())
                .isEqualTo("kimi");
        assertThat(AiModelProfile.KIMI.getHistoryLimit())
                .isGreaterThan(AiModelProfile.STANDARD.getHistoryLimit());
        assertThat(AiModelProfile.GLM.getProvider())
                .isEqualTo("glm");
        assertThat(AiModelProfile.GLM.isAvailableTo("STUDENT"))
                .isTrue();
    }

    @Test
    void shouldRejectUnknownModelKey() {
        assertThatThrownBy(() -> AiModelProfile.fromKey("unknown"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("不支持的模型档位");
    }
}
