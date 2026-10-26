package com.campusai.timetable;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class KimiTimetableVisionModelTest {
    @Test void sendsActualImageContentArrayAndTokenizesSameImage(){
        var builder=RestClient.builder().baseUrl("https://vision.example.test/v1");var server=MockRestServiceServer.bindTo(builder).build();var json=new ObjectMapper();
        for(String path:new String[]{"/tokenizers/estimate-token-count","/chat/completions"})server.expect(requestTo("https://vision.example.test/v1"+path)).andExpect(r->{var body=json.readTree(((MockClientHttpRequest)r).getBodyAsString());var parts=body.path("messages").path(1).path("content");assertThat(parts.isArray()).isTrue();assertThat(parts.path(0).path("image_url").path("url").asText()).isEqualTo("data:image/png;base64,AQID");if(path.equals("/chat/completions")){assertThat(body.path("reasoning_effort").asText()).isEqualTo("low");assertThat(body.path("max_completion_tokens").asInt()).isEqualTo(6000);assertThat(body.has("tools")).isFalse();}}).andRespond(withSuccess(path.contains("tokenizers")?"{\"data\":{\"total_tokens\":123}}":"{\"model\":\"kimi-k3\",\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"content\":\"{}\"}}],\"usage\":{\"prompt_tokens\":123,\"completion_tokens\":5,\"total_tokens\":128}}",MediaType.APPLICATION_JSON));
        var model=new KimiTimetableVisionModel(builder.build(),"test-key","kimi-k3","https://vision.example.test/v1",6000);assertThat(model.estimate(new byte[]{1,2,3},"image/png")).isEqualTo(123);assertThat(model.recognize(new byte[]{1,2,3},"image/png").totalTokens()).isEqualTo(128);server.verify();
    }
    @Test void unavailableVisionModelRefusesBeforeNetwork(){var model=new KimiTimetableVisionModel(RestClient.create(),"test-key","text-only-model","https://vision.example.test",6000);assertThat(model.capability().available()).isFalse();assertThatThrownBy(()->model.recognize(new byte[]{1},"image/png")).hasMessageContaining("503");}
    @Test void tokenEstimateMustBeBoundedInteger(){var builder=RestClient.builder().baseUrl("https://vision.example.test/v1");var server=MockRestServiceServer.bindTo(builder).build();server.expect(anything()).andRespond(withSuccess("{\"data\":{\"total_tokens\":12001}}",MediaType.APPLICATION_JSON));var model=new KimiTimetableVisionModel(builder.build(),"key","kimi-k3","https://vision.example.test",6000);assertThatThrownBy(()->model.estimate(new byte[]{1},"image/png")).hasMessageContaining("413");server.verify();}
    @Test void truncatedOutputIsNotAcceptedAsCompleteRecognition(){var builder=RestClient.builder().baseUrl("https://vision.example.test/v1");var server=MockRestServiceServer.bindTo(builder).build();server.expect(anything()).andRespond(withSuccess("{\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"{}\"}}]}",MediaType.APPLICATION_JSON));var model=new KimiTimetableVisionModel(builder.build(),"key","kimi-k3","https://vision.example.test",6000);assertThatThrownBy(()->model.recognize(new byte[]{1},"image/png")).hasMessageContaining("502");server.verify();}
}
