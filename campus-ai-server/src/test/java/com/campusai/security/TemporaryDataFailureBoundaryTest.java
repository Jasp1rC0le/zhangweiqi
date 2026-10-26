package com.campusai.security;

import com.campusai.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.dao.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.*;

class TemporaryDataFailureBoundaryTest {
    @RestController static class Probe {
        @GetMapping("/api/probe/{kind}") Object read(@PathVariable String kind){
            RuntimeException failure=switch(kind){
                case "timeout" -> new QueryTimeoutException("SECRET SQL private-host");
                case "connection" -> new org.springframework.jdbc.CannotGetJdbcConnectionException("SECRET SQL private-host");
                case "transport" -> new RecoverableDataAccessException("SECRET SQL private-host");
                case "transaction" -> new CannotCreateTransactionException("SECRET SQL private-host");
                case "rollback" -> new org.springframework.transaction.TransactionSystemException("SECRET SQL private-host");
                default -> new org.springframework.jdbc.BadSqlGrammarException("SECRET","SELECT PRIVATE",new java.sql.SQLException());
            };throw failure;
        }
    }
    @Test void temporaryDataFailuresAreSanitizedBoundedAndDoNotClaimAWriteWasRolledBack()throws Exception{
        var mvc=MockMvcBuilders.standaloneSetup(new Probe()).setControllerAdvice(new GlobalExceptionHandler()).build();
        for(String kind:new String[]{"timeout","connection","transport","transaction","rollback"})mvc.perform(get("/api/probe/"+kind))
                .andExpect(status().isServiceUnavailable()).andExpect(header().string("Retry-After","2"))
                .andExpect(header().string("Cache-Control","no-store"))
                .andExpect(content().string(containsString("结果尚未确认")))
                .andExpect(content().string(not(containsString("SECRET"))))
                .andExpect(content().string(not(containsString("private-host"))))
                .andExpect(content().string(not(containsString("未写入"))));
    }
    @Test void invalidSqlDoesNotMasqueradeAsTemporaryOverload()throws Exception{
        MockMvcBuilders.standaloneSetup(new Probe()).setControllerAdvice(new GlobalExceptionHandler()).build()
                .perform(get("/api/probe/syntax")).andExpect(status().isInternalServerError())
                .andExpect(content().string(not(containsString("SECRET"))));
    }
}
