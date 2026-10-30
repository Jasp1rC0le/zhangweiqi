package com.campusai.community;

import java.text.Normalizer;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Bounded local text checks, not a claim of comprehensive compliance or an external model. */
public final class CommunityTextPolicy {
    private CommunityTextPolicy() {}
    private static final Pattern PRIVATE = Pattern.compile("(?<!\\d)1[3-9]\\d{9}(?!\\d)|[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}|(?<!\\d)\\d{17}[\\dX](?!\\d)",Pattern.CASE_INSENSITIVE);
    private static final Pattern CONTACT = Pattern.compile("(?:微信|vx|wechat|qq)(?:号|号码|联系|加我|加)?[:：=]?[a-z0-9_-]{5,}",Pattern.CASE_INSENSITIVE);
    private static final Pattern ABUSE = Pattern.compile("傻[逼屄]|操你[妈娘]|去死吧|杀了你|弄死你|人肉你|废物东西");
    private static final Pattern RISK = Pattern.compile("刷单返佣|代开发票|裸聊招募|出售银行卡|出售身份证|售卖枪支|制作炸弹教程|制毒教程");
    public static void check(String value) {
        if (value == null || value.isEmpty()) return;
        String normalized=Normalizer.normalize(value,Normalizer.Form.NFKC);
        if(normalized.codePoints().anyMatch(c->Character.isISOControl(c)&&c!='\n'&&c!='\r'&&c!='\t')) bad("内容含不支持的控制字符，请调整后发布");
        String probe=normalized.replaceAll("[\\p{Z}\\s\\p{Cf}]","");
        if(PRIVATE.matcher(probe).find() || CONTACT.matcher(probe).find()) bad("请移除手机号、邮箱、证件号或私人联系方式后发布");
        String words=probe.replaceAll("[\\p{P}]","");
        if(ABUSE.matcher(words).find()) bad("请调整含人身攻击的表达后发布，正常吐槽和差评可以保留");
        if(RISK.matcher(words).find()) bad("内容包含高风险招揽或危险指导，请调整后发布");
        if(Pattern.compile("(.{1,4})\\1{19,}").matcher(words).find()) bad("重复内容过多，请精简后发布");
    }
    private static void bad(String message) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
}
