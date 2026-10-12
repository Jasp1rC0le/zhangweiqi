package com.campusai.service.impl;

import java.util.regex.Pattern;

/** Only standalone clock requests may bypass retrieval and the model. */
final class SystemTimeIntent {
    private static final Pattern CLOCK = Pattern.compile(
            "(?:你好)?(?:请问|请告诉我|告诉我|我想知道|帮我看下|帮我查下)?"
            + "(?:现在|当前|今天|今日)(?:的)?(?:是)?"
            + "(?:几点(?:几分)?(?:钟)?|什么时间|什么日期|几月几[日号]|几号|多少号|星期几|周几|日期|时间)"
            + "(?:是多少|是什么)?(?:呢|呀|啊|了|吗)?(?:谢谢)?");

    private SystemTimeIntent() {}

    static boolean isPureClockQuestion(String question) {
        if (question == null || question.length() > 80) return false;
        String normalized = question.replaceAll("[\\s\\p{P}]+", "");
        // Subject-bearing questions and mixed requests continue through normal retrieval.
        return CLOCK.matcher(normalized).matches();
    }
}
