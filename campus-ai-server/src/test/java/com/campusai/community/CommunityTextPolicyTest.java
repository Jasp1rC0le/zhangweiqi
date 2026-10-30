package com.campusai.community;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class CommunityTextPolicyTest {
 @Test void letsOrdinaryComplaintsAndSocialRequestsPublish(){for(String t:java.util.List.of("太难吃了，价格也贵，不推荐", "找个周末一起学习的搭子", "味道像妈妈做的", "校园网今天又断了，真烦"))assertThatCode(()->CommunityTextPolicy.check(t)).doesNotThrowAnyException();}
 @Test void blocksObfuscatedIdentifiersAndDirectAbuse(){for(String t:java.util.List.of("１３８ ００１３ ８０００", "电话138\u200b00138000", "user@example.com", "加微信abc12345", "你是傻。逼", "刷单返佣，日赚千元"))assertThatThrownBy(()->CommunityTextPolicy.check(t)).hasMessageContaining("400");}
}
