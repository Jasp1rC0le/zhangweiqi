package com.campusai.service.impl;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class SystemTimeIntentTest {
    @ParameterizedTest
    @ValueSource(strings = {"现在几点？", "请问今天星期几", "今天几月几号？", "当前时间是多少？",
            "你好，请告诉我现在是几点钟，谢谢", "今日日期", "今天是周几", "今天的日期是什么"})
    void recognizesStandaloneClockRequests(String question) {
        assertThat(SystemTimeIntent.isPureClockQuestion(question)).isTrue();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
            "中德检索第一次注册需要在校园网吗？请标明这份学校说明的发布日期，不要把今天核验日期当发布日期",
            "图书馆现在几点关门？", "今天学生证补办几点结束？", "今天的考试时间是什么",
            "当前政策的发布日期", "今天日期多少，以及宿舍电费怎么交", "现在几点？图书馆在哪里？",
            "今天哪些事可以办理", "今天下雨吗", "今天的申请日期不能晚于什么时候"})
    void doesNotSwallowKnowledgeOrCompoundQuestions(String question) {
        assertThat(SystemTimeIntent.isPureClockQuestion(question)).isFalse();
    }
}
